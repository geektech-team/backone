import type { VNode } from '@geektech/tsone';
import { renderHome } from './pages/home';
import { renderBackoneDecorators } from './pages/decorators';
import {
  renderBackoneOverview,
  renderBackoneQuickstart,
  renderBackoneServer,
  renderBackoneMiddleware,
  renderBackoneContext,
  renderBackoneWebsocket,
} from './pages/backone';
import {
  renderUtilsOverview,
  renderUtilsDb,
  renderUtilsId,
  renderUtilsCache,
  renderUtilsJwt,
  renderUtilsHttp,
  renderUtilsRateLimit,
  renderUtilsSchema,
  renderUtilsConfig,
} from './pages/utils';
import {
  renderCliOverview,
  renderCliCommands,
  renderCliTemplates,
} from './pages/cli';

/** 页面渲染上下文：basePath 与 base 感知的链接工厂 */
export interface PageContext {
  /** 站点部署的 base 前缀（'' 或 '/backone'） */
  basePath: string;
  /** 生成指向某个 route 的绝对链接（自动附加 base 与尾部斜杠） */
  href(route: string): string;
}

export interface DocPage {
  /** 逻辑路由，如 '/backone'、'/utils/db' */
  route: string;
  /** 导航与文档标题 */
  title: string;
  /** meta description */
  description: string;
  /** 页面内容渲染函数 */
  render(ctx: PageContext): VNode | VNode[];
}

export interface DocSection {
  /** 段标识，如 'backone' */
  id: string;
  /** 导航段标题 */
  label: string;
  /** 包名 */
  packageName: string;
  /** 包版本（展示用） */
  version: string;
  pages: DocPage[];
}

export const homePage: DocPage = {
  route: '/',
  title: '概览',
  description:
    'BackOne 服务端生态文档：@geektech/backone 框架、@geektech/backone-utils 工具包与 @geektech/backone-cli 脚手架。',
  render: renderHome,
};

export const sections: DocSection[] = [
  {
    id: 'backone',
    label: 'BackOne 框架',
    packageName: '@geektech/backone',
    version: '0.1.0',
    pages: [
      {
        route: '/backone',
        title: '概览',
        description:
          'BackOne 框架：Bun 原生轻量级 TypeScript 服务端框架，零运行时依赖。',
        render: renderBackoneOverview,
      },
      {
        route: '/backone/quickstart',
        title: '快速开始',
        description:
          '从零创建第一个 BackOne 服务：路由、中间件、静态文件与错误处理。',
        render: renderBackoneQuickstart,
      },
      {
        route: '/backone/server',
        title: '服务端与路由',
        description:
          'createServer 选项、路由注册、路径参数、路由组、usePrefix 与生命周期。',
        render: renderBackoneServer,
      },
      {
        route: '/backone/decorators',
        title: 'Controller 装饰器',
        description:
          '标准装饰器 Controller、HTTP 方法、Use 与显式注册，支持服务构造注入和路由清单。',
        render: renderBackoneDecorators,
      },
      {
        route: '/backone/middleware',
        title: '中间件',
        description:
          '洋葱模型与内置中间件：logger / cors / gzip / helmet / timeout / serveStatic。',
        render: renderBackoneMiddleware,
      },
      {
        route: '/backone/context',
        title: '上下文与响应',
        description:
          'Context API：params / query / body / cookie，响应构建与返回值序列化。',
        render: renderBackoneContext,
      },
      {
        route: '/backone/websocket',
        title: 'WebSocket',
        description: '基于 Bun 原生 WebSocket 的按路径处理器注册与生命周期。',
        render: renderBackoneWebsocket,
      },
    ],
  },
  {
    id: 'utils',
    label: 'BackOne Utils',
    packageName: '@geektech/backone-utils',
    version: '0.5.0',
    pages: [
      {
        route: '/utils',
        title: '概览',
        description:
          'backone-utils 通用工具包：数据库、ID、缓存、JWT、HTTP、限流、Schema、配置。',
        render: renderUtilsOverview,
      },
      {
        route: '/utils/db',
        title: '数据库',
        description:
          '多库 CRUD：Database / DatabaseManager / Table，where DSL 与事务。',
        render: renderUtilsDb,
      },
      {
        route: '/utils/id',
        title: 'ID 生成',
        description: 'uuidv4 / uuidv7 / nanoid / snowflake 四种 ID 策略。',
        render: renderUtilsId,
      },
      {
        route: '/utils/cache',
        title: '缓存',
        description: 'TTL 惰性过期与 LRU 容量淘汰，getOrSet 工厂。',
        render: renderUtilsCache,
      },
      {
        route: '/utils/jwt',
        title: 'JWT',
        description: 'WebCrypto HMAC JWT 签发与验证（HS256/384/512）。',
        render: renderUtilsJwt,
      },
      {
        route: '/utils/http',
        title: 'HTTP 客户端',
        description: 'fetch 封装：超时、指数退避重试、查询参数与 JSON。',
        render: renderUtilsHttp,
      },
      {
        route: '/utils/rate-limit',
        title: '限流',
        description: '固定窗口 / 滑动窗口 / 令牌桶三种限流策略。',
        render: renderUtilsRateLimit,
      },
      {
        route: '/utils/schema',
        title: 'Schema 校验',
        description: 'zod 风格轻量校验器：类型推导、safeParse 与 v 工厂。',
        render: renderUtilsSchema,
      },
      {
        route: '/utils/config',
        title: '全局配置',
        description: '从环境变量读取强类型配置，启动期 fail-fast 校验。',
        render: renderUtilsConfig,
      },
    ],
  },
  {
    id: 'cli',
    label: 'BackOne CLI',
    packageName: '@geektech/backone-cli',
    version: '0.2.0',
    pages: [
      {
        route: '/cli',
        title: '概览',
        description: 'BackOne CLI 脚手架：安装、命令与快速开始。',
        render: renderCliOverview,
      },
      {
        route: '/cli/commands',
        title: '命令',
        description: 'init 命令用法、交互式模板选择与编程式 API initProject。',
        render: renderCliCommands,
      },
      {
        route: '/cli/templates',
        title: '项目模板',
        description: 'minimal / rest-api / websocket 三种项目模板详解。',
        render: renderCliTemplates,
      },
    ],
  },
];

/** 全部页面（含首页），按 route 索引 */
export const allPages: DocPage[] = [
  homePage,
  ...sections.flatMap((section) => section.pages),
];

const pageByRoute = new Map(allPages.map((page) => [page.route, page]));

/** 按 route 精确查找页面 */
export function findPage(route: string): DocPage | null {
  return pageByRoute.get(route) ?? null;
}

export interface ResolvedRequest {
  page: DocPage;
  basePath: string;
}

/**
 * 解析当前 URL 对应的页面与 base 前缀。
 *
 * 支持两种部署形态：
 * - 开发 / 无 base：路径即 route，如 `/backone/quickstart`
 * - GitHub Pages 子路径：route 之前是 base，如 `/backone/backone/quickstart/`
 *
 * 特殊情况：`/backone/`（Pages 首页，末尾带斜杠且整段等于 base）解析为首页。
 */
export function resolveRequest(pathname: string): ResolvedRequest {
  const raw = pathname;
  const normalized = raw.replace(/\/+$/, '');
  if (normalized === '') {
    return { page: homePage, basePath: '' };
  }

  // Pages 首页：/backone/ → 首页 + base=/backone
  if (raw.endsWith('/') && normalized === '/backone') {
    return { page: homePage, basePath: '/backone' };
  }

  // 按段切分，从短 base（''）到长 base 尝试 base + route 分解
  const segments = normalized.split('/').filter(Boolean);
  for (let i = 0; i <= segments.length; i += 1) {
    const base = i === 0 ? '' : `/${segments.slice(0, i).join('/')}`;
    const rel = i === segments.length ? '/' : `/${segments.slice(i).join('/')}`;
    const page = findPage(rel);
    if (page !== null) {
      return { page, basePath: base };
    }
  }

  // 未知路径：当作首页 + base 处理（保持链接可访问）
  return { page: homePage, basePath: normalized };
}

/** 生成 base 感知的绝对链接（非根路由补尾部斜杠） */
export function pageHref(basePath: string, route: string): string {
  if (route === '/') {
    return `${basePath}/`;
  }
  return `${basePath}${route}/`;
}

/** 创建页面渲染上下文 */
export function createPageContext(basePath: string): PageContext {
  return {
    basePath,
    href: (route) => pageHref(basePath, route),
  };
}
