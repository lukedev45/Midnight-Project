export function inMemoryPrivateStateProvider() {
    const store = new Map();
    return {
        get: async (id) => store.get(id) ?? null,
        set: async (id, state) => {
            store.set(id, state);
        },
        remove: async (id) => {
            store.delete(id);
        },
    };
}
//# sourceMappingURL=private-state.js.map