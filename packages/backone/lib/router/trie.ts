/**
 * 分段基数树（segment trie）路由表。
 * 支持静态段、:param 动态段与 * 通配段；匹配复杂度为路径段数线性。
 */

import type { Handler, RouteMethod } from '../types';

interface TrieNode {
  children: Map<string, TrieNode>;
  paramName: string | null;
  paramChild: TrieNode | null;
  wildcardName: string | null;
  wildcardChild: TrieNode | null;
  handlers: Map<RouteMethod, Handler[]> | null;
}

function createNode(): TrieNode {
  return {
    children: new Map(),
    paramName: null,
    paramChild: null,
    wildcardName: null,
    wildcardChild: null,
    handlers: null,
  };
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

export interface TrieResult {
  node: TrieNode;
  params: Record<string, string>;
}

export class Trie {
  readonly #root = createNode();

  insert(path: string, method: RouteMethod, handler: Handler): void {
    const segments = splitPath(path);
    let node = this.#root;

    for (const segment of segments) {
      if (segment === '*') {
        if (node.wildcardChild === null) {
          node.wildcardChild = createNode();
          node.wildcardName = 'wildcard';
        }
        node = node.wildcardChild;
        continue;
      }
      if (segment.startsWith(':')) {
        if (node.paramChild === null) {
          node.paramChild = createNode();
        }
        node.paramChild.paramName = segment.slice(1);
        node = node.paramChild;
        continue;
      }
      let child = node.children.get(segment);
      if (child === undefined) {
        child = createNode();
        node.children.set(segment, child);
      }
      node = child;
    }

    if (node.handlers === null) {
      node.handlers = new Map();
    }
    const list = node.handlers.get(method);
    if (list === undefined) {
      node.handlers.set(method, [handler]);
    } else {
      list.push(handler);
    }
  }

  match(pathname: string): TrieResult | null {
    const segments = splitPath(pathname);
    const params: Record<string, string> = {};
    let node = this.#root;

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const child = node.children.get(segment);
      if (child !== undefined) {
        node = child;
        continue;
      }
      if (node.paramChild !== null) {
        const paramChild = node.paramChild;
        if (paramChild.paramName !== null) {
          params[paramChild.paramName] = safeDecode(segment);
        }
        node = paramChild;
        continue;
      }
      if (node.wildcardChild !== null) {
        const rest = segments.slice(i).map(safeDecode).join('/');
        if (node.wildcardName !== null) {
          params[node.wildcardName] = rest;
        }
        node = node.wildcardChild;
        break;
      }
      return null;
    }

    return { node, params };
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
