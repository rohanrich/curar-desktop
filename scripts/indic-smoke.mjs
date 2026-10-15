import {createIndicEngine,configureIndicWasm} from '../translation-runtime/indic-engine.mjs';
import {createHash} from 'node:crypto';import {writeFile,mkdir} from 'node:fs/promises';
configureIndicWasm({mjs:new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',import.meta.url).href,wasm:new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',import.meta.url).href});
await mkdir('indic-results',{recursive:true});const result=[];
for(const [direction,repo,revision] of [['forward','hari31416/indictrans2-en-indic-dist-200M-ONNX-int8','1eaa43a3fb76f382f1b22c76e56f6ab4926ad68b'],['reverse','hari31416/indictrans2-indic-en-dist-200M-ONNX-int8','a7ecdc0ba73148c6e1d051ca372332471d8aff4f']]){
 const started=Date.now();const engine=await createIndicEngine(async name=>{const r=await fetch(`https://huggingface.co/${repo}/resolve/${revision}/${name}`,{headers:{'Accept-Encoding':'identity'}});if(!r.ok)throw Error('Model resource unavailable: '+name);const bytes=new Uint8Array(await r.arrayBuffer());console.log(name,bytes.length,createHash('sha256').update(bytes).digest('hex'));return bytes});console.log('READY',direction,(Date.now()-started)/1000);
 const tests=direction==='forward'?['Hello doctor.','Your report is ready. Please call your doctor.','This is a fictional report for testing translation. No real patient information is included.']:['నమస్తే డాక్టర్.','మీ నివేదిక సిద్ధంగా ఉంది. దయచేసి మీ వైద్యుడికి ఫోన్ చేయండి.'];
 for(const text of tests){const translated=await engine.translate(text,direction==='forward'?'en':'te',direction==='forward'?'te':'en');console.log(JSON.stringify({text,translated,direction}));result.push({text,translated,direction});}
 await engine.dispose();
}
await writeFile('indic-results/result.json',JSON.stringify(result,null,2));
