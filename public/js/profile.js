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
    const darkModeToggle = document.getElementById('dark-mode-toggle');

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
            ? 'Hide username field'
            : 'Change username';

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

        setProfileStatus('Uploading...');

        try {
            const response = await csrfFetch('/api/users/avatar', {
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
                changeAvatarButton.textContent = 'Change profile picture';
            }

            setProfileStatus('Profile picture updated.');
        } catch (error) {
            console.error(error);
            setProfileStatus(error.message || 'Error while uploading.', true);
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
            setProfileStatus('Updating username...');

            const response = await csrfFetch('/api/users/username', {
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
                usernameElement.textContent = `Logged in as: ${payload.username}`;
            }

            if (usernameInput) {
                usernameInput.value = payload.username;
            }

            setUsernameFormVisible(false);
            setProfileStatus('Username updated.');
        } catch (error) {
            console.error(error);
            setProfileStatus(error.message || 'Error while changing username.', true);
        }
    }

    function applyDarkMode(isDark) {
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.classList.toggle('light', !isDark);
        localStorage.setItem('darkMode', isDark ? '1' : '0');
        if (darkModeToggle) {
            darkModeToggle.checked = isDark;
        }
    }

    async function loadProfile() {
        if (profileCaption) {
            profileCaption.textContent = currentUsername === 'Guest'
                ? 'Log in to personalize your profile.'
                : 'Manage your picture and username here.';
        }

        if (usernameElement) {
            usernameElement.textContent = currentUsername === 'Guest'
                ? 'Logged in as: Guest'
                : `Logged in as: ${currentUsername}`;
        }

        renderAvatar(localStorage.getItem('avatarUrl'));

        if (darkModeToggle) {
            darkModeToggle.checked = localStorage.getItem('darkMode') === '1';
        }

        if (profileFirstTimeBanner && currentUsername !== 'Guest') {
            profileFirstTimeBanner.classList.toggle('hidden', Boolean(localStorage.getItem('avatarUrl')));
        }

        if (changeAvatarButton) {
            changeAvatarButton.textContent = localStorage.getItem('avatarUrl')
                ? 'Change profile picture'
                : 'Add a profile picture';
        }

        if (usernameInput && currentUsername !== 'Guest') {
            usernameInput.value = currentUsername;
        }

        if (currentUsername === 'Guest') {
            setProfileStatus('Log in to edit your profile.');
            if (changeAvatarButton) {
                changeAvatarButton.disabled = true;
            }
            if (toggleUsernameFormButton) {
                toggleUsernameFormButton.disabled = true;
            }
            if (darkModeToggle) {
                darkModeToggle.disabled = true;
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
                    changeAvatarButton.textContent = 'Change profile picture';
                }
            }
            // Keep the toggle and the theme in sync with what's stored server-side
            // (covers first login on a new device where localStorage is empty).
            applyDarkMode(!!payload.darkMode);
        } catch (error) {
            console.error(error);
        }
    }

    if (changeAvatarButton && avatarInput) {
        changeAvatarButton.addEventListener('click', () => {
            if (currentUsername === 'Guest') {
                setProfileStatus('Log in before uploading a picture.', true);
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

    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', async () => {
            const nextValue = darkModeToggle.checked;
            applyDarkMode(nextValue); // instant visual feedback
            
            try {
                const response = await csrfFetch('/api/users/darkmode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ darkMode: nextValue }),
                });

                if (!response.ok) {
                    throw new Error('Unable to save dark mode preference.');
                }
            } catch (error) {
                console.error(error);
                applyDarkMode(!nextValue); // roll back on failure
                setProfileStatus('Error while saving your theme preference.', true);
            }
        });
    }

    loadProfile();
});