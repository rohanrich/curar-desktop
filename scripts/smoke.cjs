'use strict';
const {spawnSync}=require('node:child_process');const path=require('node:path');const electron=require('electron');const result=spawnSync(electron,['.'],{stdio:'inherit',timeout:150000,env:{...process.env,CURAR_DESKTOP_SMOKE:'1',CURAR_SMOKE_OUTPUT:path.resolve('smoke-results')}});if(result.error)throw result.error;process.exit(result.status??1);
