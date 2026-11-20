import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../server/core.mjs';

const chrome='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const firefox='Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

test('sessions, plans, temporary passwords and persistent lockout', async t => {
  const directory=path.join(ROOT,'cache','saas-accounts-'+randomUUID());
  const file=path.join(directory,'accounts.json');
  process.env.STUDIO_ACCOUNTS_FILE=file;
  const accounts=await import('../server/accounts.mjs?saas='+randomUUID());
  try{
    const owner=await accounts.register({name:'Dueña',email:'duena@local.test',password:'clave-segura-123'},{userAgent:chrome,ip:'127.0.0.1'});
    const member=await accounts.register({name:'Socio',email:'socio@local.test',password:'clave-segura-456'},{userAgent:firefox,ip:'127.0.0.1'});
    assert.equal(owner.user.role,'owner');
    assert.equal(member.user.role,'member');

    const firstSession=await accounts.resolveSession({headers:{'x-studio-token':member.token}});
    const list=await accounts.listSessions(member.user.id,firstSession.sessionId);
    assert.equal(list.length,1);
    assert.equal(list[0].current,true);
    assert.match(list[0].device,/Firefox · Linux/);
    assert.equal('tokenHash' in list[0],false);

    const second=await accounts.login({email:'socio@local.test',password:'clave-segura-456'},{userAgent:chrome,ip:'127.0.0.1'});
    const secondSession=await accounts.resolveSession({headers:{'x-studio-token':second.token}});
    assert.equal((await accounts.listSessions(member.user.id)).length,2);

    const revoked=await accounts.revokeOtherSessions(member.user.id,secondSession.sessionId);
    assert.equal(revoked.revoked,1);
    assert.equal(await accounts.resolveSession({headers:{'x-studio-token':member.token}}),null);
    assert.ok(await accounts.resolveSession({headers:{'x-studio-token':second.token}}));

    assert.equal((await accounts.setPlan(member.user.id,'pro')).plan,'pro');
    await assert.rejects(accounts.setPlan(owner.user.id,'pro'),/dueño/);
    await assert.rejects(accounts.setPlan(member.user.id,'studio'),/Plan no válido/);
    const rows=await accounts.listAccounts();
    assert.equal(rows.length,2);
    assert.equal(rows.find(row=>row.id===member.user.id).plan,'pro');
    assert.equal(rows.find(row=>row.id===member.user.id).sessions,1);
    assert.equal(JSON.stringify(rows).includes('passwordHash'),false);

    const reset=await accounts.resetPassword(member.user.id);
    assert.ok(reset.password.length>=10);
    assert.equal(await accounts.verifyCredentials(member.user.id,reset.password),true);
    assert.equal(await accounts.verifyCredentials(member.user.id,'clave-segura-456'),false);
    assert.equal(await accounts.resolveSession({headers:{'x-studio-token':second.token}}),null);

    for(let attempt=0;attempt<10;attempt++)await assert.rejects(accounts.login({email:'duena@local.test',password:'incorrecta'}));
    let locked;
    try{await accounts.login({email:'duena@local.test',password:'clave-segura-123'});}catch(error){locked=error;}
    assert.equal(locked?.status,429);
    assert.ok(locked.retryAfter>0);
    assert.match(locked.message,/Demasiados intentos/);

    // A restart must not clear the lock: a fresh module reading the same file
    // still refuses the correct password until the window ends.
    const restarted=await import('../server/accounts.mjs?restart='+randomUUID());
    let persisted;
    try{await restarted.login({email:'duena@local.test',password:'clave-segura-123'});}catch(error){persisted=error;}
    assert.equal(persisted?.status,429);
  }finally{
    delete process.env.STUDIO_ACCOUNTS_FILE;
    await fs.rm(directory,{recursive:true,force:true});
  }
});
