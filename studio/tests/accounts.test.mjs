import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../server/core.mjs';

test('local accounts hash passwords, isolate sessions and revoke logout', async t => {
  const directory=path.join(ROOT,'cache','accounts-test-'+randomUUID());
  const file=path.join(directory,'accounts.json');
  process.env.STUDIO_ACCOUNTS_FILE=file;
  const accounts=await import('../server/accounts.mjs?test='+randomUUID());
  try{
    assert.equal(await accounts.registrationOpen(),true);
    const first=await accounts.register({name:'Cuenta Uno',email:'uno@local.test',password:'clave-segura-123'});
    assert.equal(first.first,true);
    assert.equal(first.user.role,'owner');
    assert.ok(!JSON.stringify(await fs.readFile(file,'utf8')).includes('clave-segura-123'));
    const second=await accounts.register({name:'Cuenta Dos',email:'dos@local.test',password:'clave-segura-456'});
    assert.equal(second.first,false);
    assert.equal(second.user.role,'member');
    const resolved=await accounts.resolveSession({headers:{'x-studio-token':first.token}});
    assert.equal(resolved.user.email,'uno@local.test');
    assert.equal(await accounts.resolveSession({headers:{'x-studio-token':'no-existe'}}),null);
    await assert.rejects(accounts.login({email:'uno@local.test',password:'incorrecta'}),/incorrectos/);
    const login=await accounts.login({email:'uno@local.test',password:'clave-segura-123'});
    assert.equal(login.user.id,first.user.id);
    await accounts.logout({headers:{'x-studio-token':first.token}});
    assert.equal(await accounts.resolveSession({headers:{'x-studio-token':first.token}}),null);
    const changed=await accounts.changePassword(first.user.id,{currentPassword:'clave-segura-123',password:'nueva-clave-999'},login.token);
    assert.equal(changed.ok,true);
    assert.equal((await accounts.resolveSession({headers:{'x-studio-token':login.token}})).user.email,'uno@local.test');
    await assert.rejects(accounts.login({email:'uno@local.test',password:'clave-segura-123'}),/incorrectos/);
    await assert.rejects(accounts.changePassword(first.user.id,{currentPassword:'mala',password:'otra-clave-999'},login.token),/actual/);
    assert.equal(await accounts.verifyCredentials(first.user.id,'nueva-clave-999'),true);
    assert.equal(await accounts.verifyCredentials(first.user.id,'incorrecta'),false);
    const removed=await accounts.removeAccount(first.user.id);
    assert.equal(removed.promoted.email,'dos@local.test');
    assert.equal(removed.promoted.role,'owner');
    assert.equal(await accounts.resolveSession({headers:{'x-studio-token':login.token}}),null);
  }finally{
    delete process.env.STUDIO_ACCOUNTS_FILE;
    await fs.rm(directory,{recursive:true,force:true});
  }
});