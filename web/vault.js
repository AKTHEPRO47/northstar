/* Account keys and plaintext balances never leave this device. */
(function(root) {
  'use strict';
  const encode = bytes => {const data=new Uint8Array(bytes);let text='';for(let i=0;i<data.length;i+=8192)text+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(text);};
  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const utf8 = new TextEncoder();
  const generateKey = () => 'ns1_' + encode(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  async function credentials(secret) {
    if(!/^ns1_[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('Enter your complete Northstar account key.');
    const digest = async label => encode(await crypto.subtle.digest('SHA-256',utf8.encode(label+secret))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const material=await crypto.subtle.importKey('raw',utf8.encode(secret),'HKDF',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:utf8.encode('northstar-v1'),info:utf8.encode('balance-encryption')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    return {id:await digest('account-id:'),token:await digest('account-auth:'),key};
  }
  async function encrypt(key,state) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode('northstar-v1')},key,utf8.encode(JSON.stringify(state)));
    return {format:'northstar-encrypted-v1',iv:encode(iv),data:encode(data)};
  }
  async function decrypt(key,envelope) {
    if(envelope.format!=='northstar-encrypted-v1') throw new Error('Unsupported encrypted backup.');
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv),additionalData:utf8.encode('northstar-v1')},key,decode(envelope.data))));
  }
  root.NorthstarCrypto={generateKey,credentials,encrypt,decrypt};
})(typeof window==='undefined'?globalThis:window);
