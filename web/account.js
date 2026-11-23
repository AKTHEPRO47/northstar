(() => {
  'use strict';
  const $=id=>document.getElementById(id), C=window.NorthstarCrypto;
  let account, version, queue=Promise.resolve(), conflict=false, active=false, idle;
  const status=message=>{$('sync-status').textContent=message;};
  async function request(method,body,revision) {
    const headers={Authorization:'Bearer '+account.token};
    if(body)headers['Content-Type']='application/json';
    if(revision!==undefined)headers['If-Match']=String(revision);
    const response=await fetch('/api/vault/'+account.id,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
    if(response.status===409){conflict=true;throw new Error('Another device changed your vault. Export a backup of these edits, then lock and reopen before making more changes.');}
    if(!response.ok)throw new Error(response.status===404?'No account found. Use your original key, or create a new account.':response.status===503?'Sync is not configured. Connect the Cloudflare D1 database as described in the README.':'Could not sync. Check your connection and account key.');
    return response.json();
  }
  const vault = window.NorthstarAccount = {
    state:null,
    save(state) {
      const snapshot=JSON.parse(JSON.stringify(state));
      status('Saving encrypted changes…');
      queue=queue.catch(()=>{}).then(async()=>{
        const envelope=await C.encrypt(account.key,snapshot);
        // This recovery copy contains ciphertext only. Never persist the key or plaintext.
        localStorage.setItem('northstar-encrypted-recovery-'+account.id,JSON.stringify({version,envelope}));
        if(conflict)throw new Error('Sync conflict: export a backup, then lock and reopen.');
        const result=await request('PUT',envelope,version);version=result.version;
        localStorage.removeItem('northstar-encrypted-recovery-'+account.id);
        status('Synced · encrypted');
      }).catch(error=>{status(error.message+' Your edits remain in this tab; retry sync or export a backup.');throw error;});
      return queue;
    },
    async export(state){return C.encrypt(account.key,state);},
    async import(raw){return raw.format==='northstar-encrypted-v1'?C.decrypt(account.key,raw):raw;},
    async lock(){
      try{await queue;}catch{if(!confirm('Some edits have not synced. Export a backup before locking to keep them. Lock anyway?'))return;}
      active=false;location.reload();
    }
  };
  $('create-key').addEventListener('click',()=>{
    $('account-key').value=C.generateKey();$('account-key').type='text';$('key-confirm-wrap').hidden=false;
    $('account-submit').textContent='Create encrypted account';$('account-form').dataset.create='true';
    $('account-message').textContent='Save this key in your password manager. Use it on every device. It cannot be recovered if lost.';
  });
  $('show-key').addEventListener('click',()=>{$('account-key').type=$('account-key').type==='password'?'text':'password';});
  $('account-form').addEventListener('submit',async event=>{
    event.preventDefault();$('account-submit').disabled=true;
    try{
      if(!crypto.subtle)throw new Error('Open Northstar over HTTPS to use encrypted accounts.');
      const creating=$('account-form').dataset.create==='true';
      if(creating&&!$('key-confirm').checked)throw new Error('Save your account key and tick the confirmation first.');
      account=await C.credentials($('account-key').value.trim());conflict=false;
      if(creating){const envelope=await C.encrypt(account.key,{});const result=await request('POST',envelope);version=result.version;vault.state=null;}
      else {const result=await request('GET');version=result.version;vault.state=await C.decrypt(account.key,result.envelope);if(!vault.state.items)vault.state=null;}
      // Preserve unsynced recovery data; never silently overwrite a newer remote revision.
      const cached=localStorage.getItem('northstar-encrypted-recovery-'+account.id);
      if(cached){const recovery=JSON.parse(cached);if(recovery.version===version){vault.state=await C.decrypt(account.key,recovery.envelope);status('Recovered unsynced edits; saving…');}else{$('account-message').textContent='Unsynced edits from this browser conflict with newer cloud data. Download the recovery file before continuing.';const blob=new Blob([JSON.stringify(recovery.envelope)],{type:'application/json'});$('recovery-download').href=URL.createObjectURL(blob);$('recovery-download').hidden=false;throw new Error('Recovery needed: download the encrypted recovery file, then use a different browser to inspect the current cloud vault.');}}
      $('account-key').value='';$('account-gate').hidden=true;$('workspace').hidden=false;active=true;
      window.dispatchEvent(new Event('northstar-unlocked'));resetIdle();
    }catch(error){$('account-message').textContent=error.message;}
    finally{$('account-submit').disabled=false;}
  });
  $('lock-account').addEventListener('click',()=>vault.lock());
  $('retry-sync').addEventListener('click',()=>window.dispatchEvent(new Event('northstar-retry-sync')));
  function resetIdle(){if(!active)return;clearTimeout(idle);idle=setTimeout(()=>vault.lock(),5*60*1000);}
  ['pointerdown','keydown','touchstart'].forEach(name=>document.addEventListener(name,resetIdle,{passive:true}));
})();
