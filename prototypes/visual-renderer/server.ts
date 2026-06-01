import index from "./index.html"

const port = Number(process.env.PORT ?? 3000)

Bun.serve({
  port,
  routes: {
    "/": index,
  },
})

console.log(`Fiber Factory visual renderer prototype: http://localhost:${port}`)
