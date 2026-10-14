'use strict';
const {clinicUrl}=require('./policy.cjs');
function cameraPermission({contents,main,allowed,details={},request=false}){
 if(!allowed||!main||contents!==main||details.isMainFrame!==true||!clinicUrl(details.requestingUrl||''))return false;
 return request?Array.isArray(details.mediaTypes)&&details.mediaTypes.length===1&&details.mediaTypes[0]==='video':details.mediaType==='video';
}
module.exports={cameraPermission};
