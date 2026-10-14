(() => {
  'use strict';
  const A=window.Ticket4uAPI,$=s=>document.querySelector(s);
  let users=[];const uid=u=>A.itemId(u,['id','user_id']);
  async function refresh(){
    $('#users-table').innerHTML='<div class="loading-state"><span class="spinner"></span>Loading users…</div>';
    try{users=A.listOf(await A.request('/users?page=1&per_page=100'));render();}
    catch(e){A.showLoadError('#users-table',e.message);A.setNotice('The user list could not be loaded.','error');}
  }
  function render(){
    const q=($('#user-search').value||'').trim().toLowerCase();const visible=users.filter(u=>!q||[u.name,u.full_name,u.email,u.role,String(uid(u))].some(v=>String(v||'').toLowerCase().includes(q)));
    $('#users-table').innerHTML=visible.length?`<table><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead><tbody>${visible.map(u=>`<tr><td><span class="table-primary">${A.escapeHtml(u.name||u.full_name||'User')}</span><span class="table-sub">User ID: ${A.escapeHtml(uid(u))}</span></td><td>${A.escapeHtml(u.email||'—')}</td><td>${A.badge(A.normaliseRole(u.role))}</td><td>${A.escapeHtml(A.fmtDate(u.created_at))}</td><td><div class="table-actions"><button class="btn btn-muted btn-small" data-edit-user="${A.escapeHtml(uid(u))}">Edit</button><button class="btn btn-danger btn-small" data-delete-user="${A.escapeHtml(uid(u))}">Delete</button></div></td></tr>`).join('')}</tbody></table>`:`<div class="empty-state"><div class="empty-icon">♙</div><strong>No users found</strong><p>Try a different search or add a user account.</p></div>`;
  }
  function openForm(id=''){
    const u=id?users.find(x=>String(uid(x))===String(id))||{}:{};
    const roleOptions=[{value:'customer',label:'Customer'},{value:'organiser',label:'Organiser'},{value:'admin',label:'Admin'}];
    const body=`<form id="user-form" data-id="${A.escapeHtml(id)}"><div class="form-grid">${A.textField('Full name','name',u.name||u.full_name||'','text','required maxlength="120"')}${A.textField('Email address','email',u.email||'','email','required')}${A.selectField('Role','role',roleOptions,A.normaliseRole(u.role||'customer'),'required')}${A.textField(id?'New password (optional)':'Temporary password','password','','password',id?'minlength="8" placeholder="Leave blank to keep current password"':'minlength="8" required')}</div><div class="dialog-footer"><button class="btn btn-muted" type="button" data-dialog-close>Cancel</button><button class="btn btn-primary" type="submit">${id?'Save changes':'Create user'}</button></div></form>`;
    A.showDialog(id?'Edit user':'Add user',body);
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('#add-user-button'))openForm();
    const edit=e.target.closest('[data-edit-user]');if(edit)openForm(edit.dataset.editUser);
    const del=e.target.closest('[data-delete-user]');
    if(del&&window.confirm('Delete this user account? This cannot be undone.')){
      A.request(`/users/${encodeURIComponent(del.dataset.deleteUser)}`,{method:'DELETE'}).then(()=>{A.notify('User deleted.');return refresh();}).catch(err=>A.notify(err.message,'error'));
    }
  });
  document.addEventListener('submit',async e=>{
    const form=e.target;if(form.id!=='user-form')return;e.preventDefault();
    const id=form.dataset.id,body=Object.fromEntries(new FormData(form).entries());
    if(!body.password)delete body.password;
    try{await A.request(id?`/users/${encodeURIComponent(id)}`:'/users',{method:id?'PUT':'POST',body});A.closeDialog();A.notify(id?'User updated.':'User created.');await refresh();}
    catch(err){A.notify(err.message,'error');}
  });
  $('#user-search').addEventListener('input',render);
  refresh();
})();
