import { createHash, createPublicKey, verify } from 'node:crypto';
// Tauri's base64-armored Minisign format; Ed25519 itself is verified by Node/OpenSSL.
export function verifyReleaseSignature(data, encodedSignature, encodedPublicKey) {
  const decode = text => { if (!/^[A-Za-z0-9+/=\r\n]+$/.test(text)) throw Error('Invalid signature encoding.'); return Buffer.from(text, 'base64'); };
  const publicLines=decode(encodedPublicKey).toString('utf8').trim().split(/\r?\n/);
  const lines=decode(encodedSignature).toString('utf8').trim().split(/\r?\n/);
  if(publicLines.length!==2||lines.length!==4||!lines[2].startsWith('trusted comment: '))throw Error('Invalid signed release format.');
  const pub=decode(publicLines[1]), signature=decode(lines[1]), global=decode(lines[3]);
  if(pub.length!==42||signature.length!==74||global.length!==64||pub.subarray(0,2).toString()!=='Ed'||!pub.subarray(2,10).equals(signature.subarray(2,10)))throw Error('The release does not match the pinned signing key.');
  const algorithm=signature.subarray(0,2).toString();
  if(!['Ed','ED'].includes(algorithm))throw Error('Unsupported signature algorithm.');
  const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),pub.subarray(10)])});
  const payload=algorithm==='ED'?createHash('blake2b512').update(data).digest():data;
  const sig=signature.subarray(10);
  if(!verify(null,payload,key,sig)||!verify(null,Buffer.concat([sig,Buffer.from(lines[2].slice(17))]),key,global))throw Error('Signed artifact verification failed.');
}
