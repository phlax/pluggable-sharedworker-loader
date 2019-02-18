console.log('in connect.shared.worker');

// eslint-disable-next-line
let loaded = false;

if (!self.worker) {
    self.worker = {connect: () => {}, load: async () => {}};
}

// eslint-disable-next-line
self.onconnect = async (e) => {
    if (!loaded) {
	await self.worker.load();
	loaded = true;
    }    
    let port = e.ports[0];
    self.worker.connect(port);    
    port.onmessage = async (e) => {
        return await self.worker.onmessage(port, e);
    };
};

