import assert from "node:assert/strict";
import { newUiId } from "./ui-id";
const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
try {
 const realCrypto=globalThis.crypto;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:realCrypto.getRandomValues.bind(realCrypto)}});
 const ids=Array.from({length:1000},()=>newUiId('action'));
 assert.equal(new Set(ids).size,1000);assert.ok(ids.every(id=>id.startsWith('action-')));
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});
 assert.notEqual(newUiId('toast'),newUiId('toast'));
 console.log('UI IDs OK without secure-context randomUUID and without crypto');
} finally {if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);}
