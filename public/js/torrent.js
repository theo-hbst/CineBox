document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('torrent-form');
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');
  const startBtn = document.getElementById('start-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const progressFill = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  const progressPercent = document.getElementById('progress-percent');
  const messageBox = document.getElementById('torrent-message');
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileSidebar = document.getElementById('mobile-sidebar');
  const mobileOverlay = document.getElementById('mobile-overlay');
  const uploadLabel = document.querySelector('.upload-label');

  const stateKey = 'torrentJobId';
  let activeJobId = sessionStorage.getItem(stateKey) || '';
  let activeJobStatus = '';
  const socket = typeof window.io === 'function' ? window.io() : null;

  function setMessage(text) {
    messageBox.textContent = text || '';
  }

  function setProgress(percent, active) {
    const bounded = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    progressFill.style.width = `${bounded}%`;
    progressPercent.textContent = `${Math.round(bounded)}%`;
    progressFill.classList.toggle('is-active', Boolean(active));
  }

  function setActiveJob(job) {
    if (!job) {
      activeJobId = '';
      activeJobStatus = '';
      sessionStorage.removeItem(stateKey);
      cancelBtn.disabled = true;
      startBtn.disabled = false;
      return;
    }

    activeJobId = job.id;
    activeJobStatus = job.status || '';
    sessionStorage.setItem(stateKey, job.id);

    cancelBtn.disabled = !(job.status === 'running' || job.status === 'queued');
    startBtn.disabled = !['completed', 'cancelled', 'error'].includes(job.status) && Boolean(job.id);

    const progress = typeof job.progress === 'number' ? job.progress : 0;
    const active = job.status === 'running' || job.status === 'queued' || job.status === 'cancelling';
    setProgress(progress, active);

    if (job.status === 'completed') {
      setMessage('Téléchargement terminé.');
      sessionStorage.removeItem(stateKey);
      activeJobId = '';
      activeJobStatus = 'completed';
      cancelBtn.disabled = true;
      startBtn.disabled = false;
      setProgress(100, false);
      return;
    }

    if (job.status === 'cancelled') {
      setMessage('Téléchargement annulé et nettoyé.');
      sessionStorage.removeItem(stateKey);
      activeJobId = '';
      activeJobStatus = 'cancelled';
      cancelBtn.disabled = true;
      startBtn.disabled = false;
      setProgress(0, false);
      return;
    }

    if (job.status === 'error') {
      setMessage(job.message || 'Le téléchargement a échoué.');
      sessionStorage.removeItem(stateKey);
      activeJobId = '';
      activeJobStatus = 'error';
      cancelBtn.disabled = true;
      startBtn.disabled = false;
      setProgress(progress, false);
      return;
    }

    const statusBits = [];
    if (job.message) {
      statusBits.push(job.message);
    }
    if (job.speed) {
      statusBits.push(job.speed);
    }
    if (job.eta) {
      statusBits.push(`ETA ${job.eta}`);
    }
    setMessage(statusBits.join(' • '));
    progressLabel.textContent = job.status === 'cancelling' ? 'Annulation en cours' : 'Téléchargement en cours';
  }

  function updateFormDisplay() {
    uploadZone.style.display = 'grid';
    updateSubmitState();
  }

  function updateSubmitState() {
    if (activeJobId) {
      startBtn.disabled = true;
      return;
    }

    startBtn.disabled = fileInput.files.length === 0;
  }

  function renderFileInfo(file) {
    if (!file) {
      fileInfo.style.display = 'none';
      fileInfo.innerHTML = '';
      return;
    }

    fileInfo.innerHTML = `<p><strong>Fichier sélectionné:</strong> ${file.name}</p><p><strong>Taille:</strong> ${(file.size / 1024 / 1024).toFixed(2)} MB</p>`;
    fileInfo.style.display = 'block';
  }

  async function loadCurrentJob() {
    if (!activeJobId) {
      setProgress(0, false);
      progressLabel.textContent = 'En attente d’un lancement';
      setMessage('');
      return;
    }

    try {
      const response = await fetch(`/api/torrent/status/${encodeURIComponent(activeJobId)}`);
      if (!response.ok) {
        setActiveJob(null);
        progressLabel.textContent = 'En attente d’un lancement';
        setMessage('');
        return;
      }

      const payload = await response.json();
      setActiveJob(payload.job);
    } catch (error) {
      setMessage(error.message);
      setActiveJob(null);
    }
  }

  async function startTorrentJob() {
    if (activeJobId) {
      return;
    }

    if (fileInput.files.length === 0) {
      setMessage('Veuillez sélectionner un fichier torrent.');
      return;
    }

    const formData = new FormData();
    formData.append('file_upload', fileInput.files[0]);

    startBtn.disabled = true;
    setMessage('Préparation du torrent...');

    const response = await fetch('/api/torrent/upload', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || 'Impossible de lancer le torrent.');
      updateSubmitState();
      return;
    }

    setActiveJob(payload.job);
  }

  async function cancelTorrentJob() {
    if (!activeJobId) {
      return;
    }

    cancelBtn.disabled = true;
    setMessage('Annulation en cours...');

    try {
      const response = await fetch(`/api/torrent/cancel/${encodeURIComponent(activeJobId)}`, {
        method: 'POST',
      });

      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || 'Impossible d’annuler le téléchargement.');
        cancelBtn.disabled = false;
        return;
      }

      setActiveJob(payload.job);
      setMessage('Annulation demandée.');
    } catch (error) {
      setMessage(error.message);
      cancelBtn.disabled = false;
    }
  }

  fileInput.addEventListener('change', () => {
    renderFileInfo(fileInput.files[0]);
    updateSubmitState();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await startTorrentJob();
    } catch (error) {
      setMessage(error.message || 'Une erreur est survenue.');
      updateSubmitState();
    }
  });

  cancelBtn.addEventListener('click', async () => {
    await cancelTorrentJob();
  });

  if (uploadLabel) {
    uploadLabel.addEventListener('dragover', (event) => {
      event.preventDefault();
      uploadLabel.classList.add('drag-over');
    });

    uploadLabel.addEventListener('dragleave', (event) => {
      event.preventDefault();
      uploadLabel.classList.remove('drag-over');
    });

    uploadLabel.addEventListener('drop', (event) => {
      event.preventDefault();
      uploadLabel.classList.remove('drag-over');
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        fileInput.files = files;
        renderFileInfo(files[0]);
        updateSubmitState();
      }
    });
  }

  if (socket) {
    socket.on('torrent:progress', (job) => {
      if (!job || job.id !== activeJobId) {
        return;
      }

      setActiveJob(job);
      progressLabel.textContent = job.status === 'cancelling' ? 'Annulation en cours' : 'Téléchargement en cours';
    });
  }

  function toggleMobileMenu() {
    if (!mobileMenuToggle || !mobileSidebar || !mobileOverlay) {
      return;
    }

    if (mobileMenuToggle.checked) {
      mobileSidebar.classList.add('open');
      mobileOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    } else {
      mobileSidebar.classList.remove('open');
      mobileOverlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('change', toggleMobileMenu);
  }

  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', () => {
      mobileMenuToggle.checked = false;
      toggleMobileMenu();
    });
  }

  if (mobileSidebar) {
    mobileSidebar.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (mobileMenuToggle) {
          mobileMenuToggle.checked = false;
        }
        toggleMobileMenu();
      });
    });
  }

  updateFormDisplay();
  loadCurrentJob();
});
