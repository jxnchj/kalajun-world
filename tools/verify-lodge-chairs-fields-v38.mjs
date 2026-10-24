import fs from 'node:fs';import assert from 'node:assert/strict';
import fresh from '../web/src/v2/lodge-chairs-data/0.js';
import old from '../web/src/v2/lodge-furniture-data/0.js';
import {decodeRoomContact} from '../web/src/v2/room-contact.js';
const a=decodeRoomContact(old.contact),b=decodeRoomContact(fresh.contact);assert.equal(a.length,b.length);
let changed=0,darker=0,lighter=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]){changed++;if(b[i]<a[i])darker++;else lighter++;}
assert.ok(changed>0);assert.notEqual(old.local.sky.sourceSHA256,fresh.local.sky.sourceSHA256);
const validity=JSON.parse(fs.readFileSync(new URL('reports/lodge-chairs-validity-v38.json',import.meta.url)));
for(const key of Object.keys(validity))assert.deepEqual(fresh.local.sky[key],validity[key]);
const report={oldSource:old.local.sky.sourceSHA256,newSource:fresh.local.sky.sourceSHA256,oldValid:old.local.sky.validProbes,newValid:fresh.local.sky.validProbes,contact:{samples:fresh.contact.samples,spacing:fresh.contact.spacing,changed,darker,lighter},sameFreshClosedValidity:true,oldFirstSkyEqualsNew:old.local.sky.data===fresh.local.sky.data,oldSecondSkyEqualsNew:old.local.secondSky.data===fresh.local.secondSky.data,scope:'Fresh full-source ray sampling and source-matched collision; browser acceptance remains separate.'};
assert.equal(report.oldFirstSkyEqualsNew,false);assert.equal(report.oldSecondSkyEqualsNew,false);
fs.writeFileSync(new URL('reports/lodge-chairs-field-change-v38.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
