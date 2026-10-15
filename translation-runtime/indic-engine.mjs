import * as ort from 'onnxruntime-web/wasm';
import {PreTrainedTokenizer} from '@huggingface/transformers';
/** CPU WASM adapter for the MIT-licensed IndicTrans2 ONNX export. No remote model code is executed. */
export function configureIndicWasm(paths){ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=paths}
export function indicScript(text,direction){return Array.from(text,c=>{const n=c.codePointAt(0);if(direction==='toTelugu'){if(n>=0x966&&n<=0x96f)return String(n-0x966);if(n===0x964||n===0x965)return '.';return n>=0x901&&n<=0x963?String.fromCodePoint(n+0x300):c;}return n>=0xc01&&n<=0xc63?String.fromCodePoint(n-0x300):n>=0xc66&&n<=0xc6f?String(n-0xc66):c}).join('')}
function prepare(text,source,target){let s=source==='te'?indicScript(text,'toDevanagari'):text;return `${source==='te'?'tel_Telu':'eng_Latn'} ${target==='te'?'tel_Telu':'eng_Latn'} `+s.normalize('NFC').replace(/([.,!?;:()])/g,' $1 ').replace(/\s+/g,' ').trim()}
function postprocess(text,target){let s=target==='te'?indicScript(text,'toTelugu'):text;return s.replace(/\s+([.,!?;:%])/g,'$1').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').trim()}
export async function createIndicEngine(load){
 const [config,meta,src,tgt]=await Promise.all(['config.json','tokenizer_meta.json','tokenizer_src.json','tokenizer_tgt.json'].map(async name=>JSON.parse(new TextDecoder().decode(await load(name)))));
 const sourceTokenizer=new PreTrainedTokenizer(src,{unk_token:'<unk>',bos_token:'<s>',eos_token:'</s>',pad_token:'<pad>'}),targetTokenizer=new PreTrainedTokenizer(tgt,{unk_token:'<unk>',bos_token:'<s>',eos_token:'</s>',pad_token:'<pad>'});
 const encData=await load('encoder_model.onnx.data');const encoder=await ort.InferenceSession.create(await load('encoder_model.onnx'),{executionProviders:['wasm'],externalData:[{path:'encoder_model.onnx.data',data:encData}]});
 const decData=await load('decoder_shared.onnx.data');const decoder=await ort.InferenceSession.create(await load('decoder_model.onnx'),{executionProviders:['wasm'],externalData:[{path:'decoder_shared.onnx.data',data:decData}]});
 const cachedDecoder=await ort.InferenceSession.create(await load('decoder_with_past_model.onnx'),{executionProviders:['wasm'],externalData:[{path:'decoder_shared.onnx.data',data:decData}]});
 const intTensor=ids=>new ort.Tensor('int64',BigInt64Array.from(ids,x=>BigInt(x)),[1,ids.length]);
 return {async translate(text,source,target,progress){
  if(!((source==='en'&&target==='te')||(source==='te'&&target==='en')))throw Error('Choose English ↔ Telugu for this model.');
  const encoded=sourceTokenizer(prepare(text,source,target),{return_tensor:false});let ids=Array.from(Array.isArray(encoded.input_ids[0])?encoded.input_ids[0]:encoded.input_ids,Number).map(i=>i<meta.src_dict_size?i:meta.unk_id);if(ids.length>250)throw Error('This section is too long for the Telugu model. Translate a shorter section.');
  const inputIds=intTensor(ids),mask=intTensor(ids.map(()=>1)),encodedResult=await encoder.run({input_ids:inputIds,attention_mask:mask});const hidden=encodedResult.last_hidden_state;
  const tokens=[config.decoder_start_token_id||2];let past,previous=[],nextInput;try{for(let step=0;step<200;step++){
   const tokenInput=intTensor([tokens[tokens.length-1]]);let feed={input_ids:tokenInput,encoder_attention_mask:mask};if(!past)feed.encoder_hidden_states=hidden;else for(const name of cachedDecoder.inputNames){if(name.startsWith('past_key_values.'))feed[name]=past[name.replace('past_key_values.','present.')];}
   const current=await (past?cachedDecoder:decoder).run(feed);tokenInput.dispose();const logits=current.logits,values=logits.data,start=values.length-config.decoder_vocab_size;let best=0;for(let i=1;i<config.decoder_vocab_size;i++)if(values[start+i]>values[start+best])best=i;tokens.push(best);logits.dispose();
   const nextPast={...past,...current};delete nextPast.logits;const retained=new Set(Object.values(nextPast));for(const old of previous)if(!retained.has(old))old.dispose();previous=Array.from(retained);past=nextPast;
   progress?.(postprocess(targetTokenizer.decode(tokens,{skip_special_tokens:true}),target));if(best===(config.eos_token_id||2))return postprocess(targetTokenizer.decode(tokens,{skip_special_tokens:true}),target);
  }throw Error('The Telugu translation exceeded its length limit. Translate a shorter section.');}finally{inputIds.dispose();mask.dispose();hidden.dispose();for(const tensor of previous)tensor.dispose();}
 },async dispose(){await Promise.all([encoder.release(),decoder.release(),cachedDecoder.release()])}};
}
