document.addEventListener('DOMContentLoaded', () => {
    let currentUsername = localStorage.getItem('username') || 'Guest';
    const usernameElement = document.getElementById('username');
    const avatarImage = document.getElementById('profile-avatar');
    const avatarFallback = document.getElementById('profile-avatar-fallback');
    const avatarInput = document.getElementById('avatar-input');
    const changeAvatarButton = document.getElementById('change-avatar-button');
    const profileFirstTimeBanner = document.getElementById('profile-first-time-banner');
    const usernameForm = document.getElementById('username-form');
    const usernameInput = document.getElementById('username-input');
    const toggleUsernameFormButton = document.getElementById('toggle-username-form-button');
    const cancelUsernameButton = document.getElementById('cancel-username-button');
    const profileStatus = document.getElementById('profile-status');
    const profileCaption = document.getElementById('profile-caption');

    function getInitials(value) {
        return value
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join('') || '??';
    }

    function renderAvatar(avatarUrl) {
        if (!avatarImage || !avatarFallback) {
            return;
        }

        avatarImage.onerror = () => {
            avatarImage.removeAttribute('src');
            avatarImage.classList.add('hidden');
            avatarFallback.textContent = getInitials(currentUsername);
            avatarFallback.classList.remove('hidden');
        };

        if (avatarUrl) {
            avatarImage.src = avatarUrl;
            avatarImage.classList.remove('hidden');
            avatarFallback.classList.add('hidden');
            return;
        }

        avatarImage.removeAttribute('src');
        avatarImage.classList.add('hidden');
        avatarFallback.textContent = getInitials(currentUsername);
        avatarFallback.classList.remove('hidden');
    }

    function setProfileStatus(message, isError = false) {
        if (!profileStatus) {
            return;
        }

        profileStatus.textContent = message;
        profileStatus.classList.toggle('text-red-500', isError);
        profileStatus.classList.toggle('text-gray-500', !isError);
        profileStatus.classList.toggle('dark:text-red-300', isError);
        profileStatus.classList.toggle('dark:text-gray-300', !isError);
    }

    function setUsernameFormVisible(isVisible) {
        if (!usernameForm || !toggleUsernameFormButton) {
            return;
        }

        usernameForm.classList.toggle('hidden', !isVisible);
        toggleUsernameFormButton.textContent = isVisible
            ? 'Masquer le nom d\'utilisateur'
            : 'Modifier le nom d\'utilisateur';

        if (isVisible && usernameInput) {
            usernameInput.value = currentUsername === 'Guest' ? '' : currentUsername;
            usernameInput.focus();
        }
    }

    async function uploadAvatar(file) {
        if (!file || currentUsername === 'Guest') {
            return;
        }

        const formData = new FormData();
        formData.append('username', currentUsername);
        formData.append('avatar', file);

        setProfileStatus('Téléversement en cours...');

        try {
            const response = await fetch('/api/users/avatar', {
                method: 'POST',
                body: formData,
            });

            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Unable to upload avatar.');
            }

            renderAvatar(payload.avatarUrl);
            localStorage.setItem('avatarUrl', payload.avatarUrl);

            if (profileFirstTimeBanner) {
                profileFirstTimeBanner.classList.add('hidden');
            }

            if (changeAvatarButton) {
                changeAvatarButton.textContent = 'Modifier la photo de profil';
            }

            setProfileStatus('Photo de profil mise à jour.');
        } catch (error) {
            console.error(error);
            setProfileStatus(error.message || 'Erreur lors du téléversement.', true);
        } finally {
            if (avatarInput) {
                avatarInput.value = '';
            }
        }
    }

    async function updateUsername(nextUsername) {
        const cleanedUsername = nextUsername.trim();

        if (!cleanedUsername || cleanedUsername === currentUsername) {
            setUsernameFormVisible(false);
            return;
        }

        try {
            setProfileStatus('Mise à jour du nom d\'utilisateur...');

            const response = await fetch('/api/users/username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentUsername: currentUsername,
                    newUsername: cleanedUsername,
                }),
            });

            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Unable to update username.');
            }

            currentUsername = payload.username;
            localStorage.setItem('username', payload.username);

            if (payload.avatarUrl) {
                localStorage.setItem('avatarUrl', payload.avatarUrl);
                renderAvatar(payload.avatarUrl);
            }

            if (usernameElement) {
                usernameElement.textContent = `Connecté en tant que : ${payload.username}`;
            }

            if (usernameInput) {
                usernameInput.value = payload.username;
            }

            setUsernameFormVisible(false);
            setProfileStatus('Nom d\'utilisateur mis à jour.');
        } catch (error) {
            console.error(error);
            setProfileStatus(error.message || 'Erreur lors du changement de nom.', true);
        }
    }

    async function loadProfile() {
        if (profileCaption) {
            profileCaption.textContent = currentUsername === 'Guest'
                ? 'Connecte-toi pour personnaliser ton profil.'
                : 'Gère ici ta photo et ton nom d\'utilisateur.';
        }

        if (usernameElement) {
            usernameElement.textContent = currentUsername === 'Guest'
                ? 'Connecté en tant que : Guest'
                : `Connecté en tant que : ${currentUsername}`;
        }

        renderAvatar(localStorage.getItem('avatarUrl'));

        if (profileFirstTimeBanner && currentUsername !== 'Guest') {
            profileFirstTimeBanner.classList.toggle('hidden', Boolean(localStorage.getItem('avatarUrl')));
        }

        if (changeAvatarButton) {
            changeAvatarButton.textContent = localStorage.getItem('avatarUrl')
                ? 'Modifier la photo de profil'
                : 'Ajouter une photo de profil';
        }

        if (usernameInput && currentUsername !== 'Guest') {
            usernameInput.value = currentUsername;
        }

        if (currentUsername === 'Guest') {
            setProfileStatus('Connecte-toi pour modifier ton profil.');
            if (changeAvatarButton) {
                changeAvatarButton.disabled = true;
            }
            if (toggleUsernameFormButton) {
                toggleUsernameFormButton.disabled = true;
            }
            return;
        }

        try {
            const response = await fetch(`/api/users/${encodeURIComponent(currentUsername)}`);
            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            renderAvatar(payload.avatarUrl);
            if (payload.avatarUrl) {
                localStorage.setItem('avatarUrl', payload.avatarUrl);
                if (profileFirstTimeBanner) {
                    profileFirstTimeBanner.classList.add('hidden');
                }
                if (changeAvatarButton) {
                    changeAvatarButton.textContent = 'Modifier la photo de profil';
                }
            }
        } catch (error) {
            console.error(error);
        }
    }

    if (changeAvatarButton && avatarInput) {
        changeAvatarButton.addEventListener('click', () => {
            if (currentUsername === 'Guest') {
                setProfileStatus('Connecte-toi avant de téléverser une photo.', true);
                return;
            }

            avatarInput.click();
        });

        avatarInput.addEventListener('change', () => {
            if (avatarInput.files && avatarInput.files.length > 0) {
                uploadAvatar(avatarInput.files[0]);
            }
        });
    }

    if (toggleUsernameFormButton) {
        toggleUsernameFormButton.addEventListener('click', () => {
            setUsernameFormVisible(Boolean(usernameForm && usernameForm.classList.contains('hidden')));
        });
    }

    if (cancelUsernameButton) {
        cancelUsernameButton.addEventListener('click', () => {
            setUsernameFormVisible(false);
            if (usernameInput) {
                usernameInput.value = currentUsername;
            }
        });
    }

    if (usernameForm && usernameInput) {
        usernameForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await updateUsername(usernameInput.value);
        });
    }

    loadProfile();
});