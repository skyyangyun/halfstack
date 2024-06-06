import Halfstack from "./mod.ts";

const COMMAND = {
    help() {
        console.log(`
fullstack [command]

command:
    help
    run[:env]
`)
    },
    run() {
        const app = new Halfstack()
        app.listen({
            port: 3100,
        }).then(() => console.debug('server is showdown'))
    },
}

if (import.meta.main) {
    (function cli() {
        const args = Deno.args
        for(let index=0; index < args.length; index++) {
            const arg=args[index]
            if(!arg.startsWith('-')) {
                const fun =  COMMAND[arg.split(':').shift()] || COMMAND['help']
                return fun(args.slice(index))
            }
        }
    })()
}
