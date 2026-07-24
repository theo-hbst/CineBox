document.addEventListener('DOMContentLoaded', async () => {
    try {
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();

        if (config.noid) {
            return;
        }
    } catch (error) {
        console.error(error);
    }

    if (!localStorage.getItem('username')) {
        window.location.href = '/';
    }
});