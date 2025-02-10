export class IndexedDatabase {
    constructor(databaseName, version) {
        if (!("indexedDB") in window) { return; };
        this.databaseName = databaseName;
        this.version = version;
        this.db = null;
    };

    async openDatabase(upgradeCallback) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, this.version);

            request.addEventListener("upgradeneeded", (event) => {
                this.db = event.target.result;
                if (upgradeCallback) { upgradeCallback(db); };
            });

            request.addEventListener("success", (event) => {
                this.db = event.target.result;
                resolve(this.db);
            });

            request.addEventListener("error", (event) => reject(event.target.error));
        });
    };

    transactionStore(storeName, mode) {
        const transaction = this.db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        return { transaction, store };
    };

    addObjectStore(name, keyPath) {
        if (!this.db.objectStoreNames.contains(name)) {
            this.db.createObjectStore(name, { keyPath });
        };
    };

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const { store } = this.transactionStore(storeName, "readonly");
            const request = (key && key != "ALL") ? store.get(key) : store.getAll();

            request.addEventListener("success", (event) => resolve(event.target.result));
            request.addEventListener("error", (event) => reject(event.target.error));
        });
    };

    async add(storeName, value) {
        return new Promise((resolve, reject) => {
            const { transaction, store } = this.transactionStore(storeName, "readwrite");
            if (Array.isArray(value)) { value.forEach((item) => store.put(item)); } else { store.put(value); };

            transaction.addEventListener("complete", () => resolve());
            transaction.addEventListener("error", (event) => reject(event.target.error));
        });
    };

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const { store } = this.transactionStore(storeName, "readwrite");
            const request = store.delete(key);

            request.addEventListener("success", () => resolve());
            request.addEventListener("error", (event) => reject(event.target.error));
        });
    };

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const { store } = this.transactionStore(storeName, "readwrite");
            const request = store.clear();

            request.addEventListener("success", () => resolve());
            request.addEventListener("error", (event) => reject(event.target.error));
        });
    };
};