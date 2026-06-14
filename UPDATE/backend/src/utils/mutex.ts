export class Mutex {
    private mutex = Promise.resolve();

    public lock(): Promise<() => void> {
        let begin: (unlock: () => void) => void;
        this.mutex = this.mutex.then(() => new Promise(begin));
        
        return new Promise(res => {
            begin = res;
        });
    }
}