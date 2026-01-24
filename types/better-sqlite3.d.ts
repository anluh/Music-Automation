declare module 'better-sqlite3' {
    export default class Database {
        constructor(filename: string, options?: any);
        exec(sql: string): any;
        prepare(sql: string): any;
        transaction(fn: any): any;
        // Add other methods as needed or use any for now
    }
}
