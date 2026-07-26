document.addEventListener('DOMContentLoaded', async () => {
    try {
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();

        if (config.noid) {
            const authResponse = await fetch('/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const payload = await authResponse.json();

            localStorage.setItem('username', payload.username);
            localStorage.setItem('admin', payload.admin ? '1' : '0');
            if (payload.avatarUrl) {
                localStorage.setItem('avatarUrl', payload.avatarUrl);
            } else {
                localStorage.removeItem('avatarUrl');
            }
            window.location.href = '/public/pages/content/home.html';
            return;
        }
    } catch (error) {
        console.error(error);
    }

    const form = document.querySelector('form');
    const usernameField = document.querySelector('input[name="login_field"]');
    const passwordField = document.querySelector('input[name="password_field"]');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            const response = await fetch('/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: usernameField.value.trim(),
                    password: passwordField.value,
                }),
            });

            const payload = await response.json();

            if (!response.ok) {
                passwordField.classList.add('error');
                setTimeout(() => passwordField.classList.remove('error'), 500);
                alert(payload.error || "Incorrect username or password.");
                return;
            }

            localStorage.setItem('username', payload.username);
            localStorage.setItem('admin', payload.admin ? '1' : '0');
            if (payload.avatarUrl) {
                localStorage.setItem('avatarUrl', payload.avatarUrl);
            } else {
                localStorage.removeItem('avatarUrl');
            }
            window.location.href = '/public/pages/content/home.html';
        } catch (error) {
            console.error(error);
            alert('Connection error. Please try again.');
        }
    });
});