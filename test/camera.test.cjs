'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {cameraPermission}=require('../camera.cjs');
test('camera only grants an opted-in main clinic window video access',()=>{
 const main={},input={main,contents:main,allowed:true,details:{requestingUrl:'https://app.curar.in/clinic',isMainFrame:true,mediaType:'video'}};
 assert(cameraPermission(input));assert(cameraPermission({...input,request:true,details:{...input.details,mediaTypes:['video']}}));
 for(const change of [{allowed:false},{contents:{}},{main:null}])assert(!cameraPermission({...input,...change}));
 for(const change of [{isMainFrame:false},{requestingUrl:'https://attacker.test/'},{mediaType:'audio'},{mediaType:'unknown'}])assert(!cameraPermission({...input,details:{...input.details,...change}}));
 for(const mediaTypes of [[],['audio'],['video','audio'],undefined])assert(!cameraPermission({...input,request:true,details:{...input.details,mediaTypes}}));
});
