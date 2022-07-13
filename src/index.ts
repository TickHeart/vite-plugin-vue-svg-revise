import { basename } from 'path'
import { readFileSync } from 'fs'
import { compileTemplate } from '@vue/compiler-sfc'
import { optimize } from 'svgo'
import type { OptimizeOptions } from 'svgo'
import type { Plugin, ResolvedConfig } from 'vite'

const fileRegex = /\.(svg)$/

declare interface PluginOptions {
  svgo?: OptimizeOptions | boolean
  htmlWrapper?: {
    tagName?: string
    attrs?: { [key: string]: string }
  }
}

export default function (options: PluginOptions = {}): Plugin {
  let viteConfig: any

  const createWrapper = (tagName: string) => {
    const attrs = options?.htmlWrapper?.attrs ?? {}

    let stringifiedAttrs = ''

    for (const key in attrs)
      stringifiedAttrs += ` ${key}=${attrs[key]}`

    return (code: string) => `<${tagName} ${stringifiedAttrs}>${code}</${tagName}>`
  }

  const wrapper = options?.htmlWrapper?.tagName
    ? createWrapper(options.htmlWrapper.tagName)
    : (code: string) => code

  async function compileSvg(source: string, path: string) {
    let { code } = compileTemplate({
      id: path,
      filename: basename(path),
      transformAssetUrls: false,
      source: wrapper(source),
    })

    code = code.replace('export function render', 'function render')
    code += '\nconst VueComponent = { render };'
    code += `
            VueComponent.name = "icon-${basename(path.replace('.svg', ''))}";
            export default VueComponent;
        `

    if (!viteConfig.isProduction) {
      code += `
                VueComponent.data = () => ({
                    path: "${path}",
                });
            `
    }

    return code
  }

  async function compileFileToJS(src: string) {
    let contents = readFileSync(src).toString()

    if (options.svgo !== false)
      contents = (optimize(contents) as any).data

    return await compileSvg(contents, src)
  }

  return {
    name: 'svg-transform',
    async configResolved(config: ResolvedConfig) {
      viteConfig = config
    },
    async transform(_: string, id: string) {
      if (fileRegex.test(id))
        return await compileFileToJS(id.replace('?inline', ''))
    },
  }
}
