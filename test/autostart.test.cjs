'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {linuxEntry}=require('../autostart.cjs');
test('startup entries retain executable paths with spaces and literal percent signs',()=>{const entry=linuxEntry('Curar Patient','/home/example/Curar Apps/Curar%Patient.AppImage');assert.match(entry,/^Exec="\/home\/example\/Curar Apps\/Curar%%Patient.AppImage" --background$/m);assert.match(entry,/Terminal=false/);assert.throws(()=>linuxEntry('Curar\nExec=unwanted','/tmp/app'));assert.throws(()=>linuxEntry('Curar','/tmp/app\nExec=unwanted'));});
