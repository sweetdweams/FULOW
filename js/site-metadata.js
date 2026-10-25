(async function syncSiteMetadata() {
  const sourcePath = document.currentScript?.dataset.source;
  if (!sourcePath) return;

  try {
    const response = await fetch(`${sourcePath}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load site metadata (${response.status})`);

    const sourceDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
    ['application-version', 'engine-version', 'dataset-updated'].forEach(name => {
      const source = sourceDocument.querySelector(`meta[name="${name}"]`);
      const target = document.querySelector(`meta[name="${name}"]`);
      if (source && target) target.setAttribute('content', source.content);
    });

    const visibleWebVersion = document.querySelector('#publication-web-version');
    const sourceWebVersion = sourceDocument.querySelector('meta[name="application-version"]');
    if (visibleWebVersion && sourceWebVersion) {
      visibleWebVersion.textContent = sourceWebVersion.content;
    }
  } catch (error) {
    console.error('Could not synchronize site metadata:', error);
  }
})();
