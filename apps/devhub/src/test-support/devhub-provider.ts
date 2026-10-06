import { createElement, type ReactElement } from 'react';

import { type DevHubLinkProps, DevHubProvider, type DevHubRouter } from '@berrypjh/devhub-ui';
import { renderToStaticMarkup } from 'react-dom/server';

/** 서버 렌더 테스트용 라우터. 앱에서는 layout의 `DevHubRoot`가 Next 라우터를 넘긴다. */
export const testRouter = (pathname = '/', hash = ''): DevHubRouter => ({
  Link: ({ to, ...rest }: DevHubLinkProps) => createElement('a', { href: to, ...rest }),
  location: { pathname, hash },
  navigate: () => undefined,
});

/** 공용 DevHub 컴포넌트가 들어 있는 트리를 provider 안에서 HTML로. */
export const renderInDevHub = (child: ReactElement, router: DevHubRouter = testRouter()) =>
  renderToStaticMarkup(
    createElement(DevHubProvider, { productName: 'Snapdone DevHub', router, children: child }),
  );
