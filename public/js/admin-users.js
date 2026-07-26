// public/js/admin-users.js
//
// User management on the server page (server.html), restricted to
// admins. The style and row structure deliberately mirror
// public/js/filemanager.js (.file-item / .file-name / .file-actions) for
// a look identical to the file manager.
//
// Reminder: the real protection is server-side (requireAdmin on
// /api/admin/users and on GET server.html). This script only renders
// the UI; if a non-admin reaches this page anyway, every API call
// will still return 403.

document.addEventListener('DOMContentLoaded', () => {
    const userManager = document.getElementById('user-manager');
    const addUserButton = document.getElementById('add-user-button');
    if (!userManager) {
        return;
    }

    function fetchUsers() {
        fetch('/api/admin/users')
            .then((res) => {
                if (res.status === 403) {
                    userManager.innerHTML = '<p style="padding:16px;">Access restricted to administrators.</p>';
                    return null;
                }
                return res.json();
            })
            .then((data) => {
                if (data) {
                    renderUsers(data.users);
                }
            })
            .catch((error) => {
                console.error('Error loading users:', error);
                userManager.innerHTML = '<p style="padding:16px;">Error loading users.</p>';
            });
    }

    function renderAddUserForm() {
        const form = document.createElement('div');
        form.className = 'move-controls';
        form.id = 'add-user-form';
        form.style.display = 'none';
        form.innerHTML = `
            <input type="text" id="new-user-username" placeholder="Username" autocomplete="off">
            <input type="password" id="new-user-password" placeholder="Password" autocomplete="new-password">
            <label class="admin-toggle"><input type="checkbox" id="new-user-admin"> Admin</label>
            <button type="button" id="confirm-add-user">Create user</button>
        `;
        userManager.appendChild(form);

        form.querySelector('#confirm-add-user').addEventListener('click', () => {
            const usernameField = form.querySelector('#new-user-username');
            const passwordField = form.querySelector('#new-user-password');
            const adminField = form.querySelector('#new-user-admin');

            const username = usernameField.value.trim();
            const password = passwordField.value;

            if (!username || !password) {
                alert("Username and password are required.");
                return;
            }

            csrfFetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, admin: adminField.checked }),
            })
                .then(async (res) => {
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        throw new Error(data.error || "Error creating the user.");
                    }
                    usernameField.value = '';
                    passwordField.value = '';
                    adminField.checked = false;
                    form.style.display = 'none';
                    fetchUsers();
                })
                .catch((error) => alert(error.message));
        });
    }

    function renderUsers(users) {
        userManager.innerHTML = '';
        renderAddUserForm();

        users.forEach((user) => {
            const userItem = document.createElement('div');
            userItem.className = 'file-item';

            const userName = document.createElement('span');
            userName.className = 'file-name';
            userName.textContent = user.username;
            if (user.admin) {
                const badge = document.createElement('span');
                badge.className = 'admin-badge';
                badge.textContent = 'Admin';
                userName.appendChild(badge);
            }

            const userActions = document.createElement('div');
            userActions.className = 'file-actions';

            // Admin toggle
            const adminLabel = document.createElement('label');
            adminLabel.className = 'admin-toggle';
            const adminCheckbox = document.createElement('input');
            adminCheckbox.type = 'checkbox';
            adminCheckbox.checked = !!user.admin;
            adminCheckbox.addEventListener('change', () => {
                const nextValue = adminCheckbox.checked;
                updateUser(
                    user.username,
                    { admin: nextValue },
                    () => fetchUsers(),
                    () => { adminCheckbox.checked = !nextValue; }
                );
            });
            adminLabel.appendChild(adminCheckbox);
            adminLabel.appendChild(document.createTextNode(' Admin'));

            // Rename
            const usernameInput = document.createElement('input');
            usernameInput.type = 'text';
            usernameInput.value = user.username;
            const renameButton = document.createElement('button');
            renameButton.textContent = 'Rename';
            renameButton.addEventListener('click', () => {
                const newUsername = usernameInput.value.trim();
                if (!newUsername || newUsername === user.username) {
                    return;
                }
                updateUser(user.username, { newUsername }, () => fetchUsers());
            });

            // Password
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.placeholder = 'New password';
            const passwordButton = document.createElement('button');
            passwordButton.textContent = 'Change password';
            passwordButton.addEventListener('click', () => {
                if (!passwordInput.value) {
                    alert('Enter a new password.');
                    return;
                }
                updateUser(user.username, { password: passwordInput.value }, () => {
                    passwordInput.value = '';
                    alert('Password updated.');
                });
            });

            // Delete
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', () => {
                if (confirm(`Delete user ${user.username}?`)) {
                    deleteUser(user.username);
                }
            });

            userActions.appendChild(adminLabel);
            userActions.appendChild(usernameInput);
            userActions.appendChild(renameButton);
            userActions.appendChild(passwordInput);
            userActions.appendChild(passwordButton);
            userActions.appendChild(deleteButton);

            userItem.appendChild(userName);
            userItem.appendChild(userActions);
            userManager.appendChild(userItem);
        });
    }

    function updateUser(username, patch, onSuccess, onError) {
        csrfFetch(`/api/admin/users/${encodeURIComponent(username)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || 'Error while updating.');
                }
                if (onSuccess) onSuccess();
            })
            .catch((error) => {
                alert(error.message);
                if (onError) onError();
            });
    }

    function deleteUser(username) {
        csrfFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' })
            .then(async (res) => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Error while deleting.');
                }
                fetchUsers();
            })
            .catch((error) => alert(error.message));
    }

    if (addUserButton) {
        addUserButton.addEventListener('click', () => {
            const form = document.getElementById('add-user-form');
            if (form) {
                form.style.display = form.style.display === 'none' ? 'flex' : 'none';
            }
        });
    }

    fetchUsers();
});
