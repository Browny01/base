import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {verifyReleaseSignature} from '../scripts/verify-release-signature.mjs';
test('release publishing verifies the pinned key, artifact and authenticated trusted comment',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const id=Buffer.from('01234567'), data=Buffer.from('release fixture'), message=createHash('blake2b512').update(data).digest(), signature=sign(null,message,privateKey), comment='timestamp:1\tfile:Base.AppImage';
 const armor=(parts:string[])=>Buffer.from(parts.join('\n')).toString('base64');
 const pub=armor(['untrusted comment: test',Buffer.concat([Buffer.from('Ed'),id,publicKey.export({type:'spki',format:'der'}).subarray(-32)]).toString('base64')]);
 const lines=['untrusted comment: test',Buffer.concat([Buffer.from('ED'),id,signature]).toString('base64'),'trusted comment: '+comment,sign(null,Buffer.concat([signature,Buffer.from(comment)]),privateKey).toString('base64')];
 const sig=armor(lines);verifyReleaseSignature(data,sig,pub);
 assert.throws(()=>verifyReleaseSignature(Buffer.from('tampered'),sig,pub),/verification failed/);
 assert.throws(()=>verifyReleaseSignature(data,armor([lines[0],lines[1],'trusted comment: changed',lines[3]]),pub),/verification failed/);
 assert.throws(()=>verifyReleaseSignature(data,'not a signature',pub),/encoding/);
 const other=generateKeyPairSync('ed25519');const wrong=armor(['untrusted comment: test',Buffer.concat([Buffer.from('Ed'),id,other.publicKey.export({type:'spki',format:'der'}).subarray(-32)]).toString('base64')]);
 assert.throws(()=>verifyReleaseSignature(data,sig,wrong),/verification failed/);
});
