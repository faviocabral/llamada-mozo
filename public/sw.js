self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// La lista de llamados vive en el servidor: el SW solo despierta la app.
// Al abrir /mozo, el socket recibe 'llamados-pendientes' y se sincroniza solo.
self.addEventListener('push', (event) => {
    if (!event.data) return;
    let data;
    try {
        data = event.data.json();
    } catch {
        data = { title: '⚠️ Nuevo llamado', body: event.data.text() };
    }

    event.waitUntil(self.registration.showNotification(data.title || '⚠️ Llamado de mesa', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [300, 100, 300],
        tag: data.tag || 'llamado-mesa',
        renotify: true,
        requireInteraction: true,
        data: { url: data.url || '/mozo' }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/mozo';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            const seg = '/' + url.split('/')[1];
            for (const client of list) {
                const path = new URL(client.url).pathname;
                if (path === url || path === seg || path.startsWith(seg + '/')) return client.focus();
            }
            return clients.openWindow(url);
        })
    );
});
