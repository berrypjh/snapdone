import Link from 'next/link';

import { Table, TableScroll, VisuallyHidden } from '@berrypjh/react-ui';

import { resolveDocLink } from '@/lib/doc-links';
import type { Block, Inline } from '@/lib/markdown';
import { sourceLinks } from '@/lib/source-links';

import { CopyButton } from '../copy-button';
import { Icon } from '../icon';

type Context = { from: string; caption: string };

/** A link written in the document, resolved: other documents stay in DevHub, the rest opens. */
function DocLink({
  href,
  from,
  children,
}: {
  href: string;
  from: string;
  children: React.ReactNode;
}) {
  const link = resolveDocLink(from, href);
  const hash = (anchor?: string) => (anchor ? `#${anchor}` : '');
  if (link.kind === 'anchor') return <a href={`#${link.anchor}`}>{children}</a>;
  if (link.kind === 'document')
    return <Link href={`/documents/${link.id}${hash(link.anchor)}`}>{children}</Link>;
  const target =
    link.kind === 'external'
      ? link.href
      : (() => {
          const { permalink, latest } = sourceLinks({ path: link.path });
          const base = permalink ?? latest;
          return base ? `${base}${hash(link.anchor)}` : null;
        })();
  if (!target) return children;
  return (
    <a href={target} target="_blank" rel="noopener noreferrer">
      {children}
      <Icon name="external" className="ml-0.5 inline align-text-top" />
      <VisuallyHidden> (새 창)</VisuallyHidden>
    </a>
  );
}

function Inlines({ nodes, from }: { nodes: Inline[]; from: string }) {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'code':
        return <code key={index}>{node.text}</code>;
      case 'strong':
        return (
          <strong key={index}>
            <Inlines nodes={node.children} from={from} />
          </strong>
        );
      case 'link':
        return (
          <DocLink key={index} href={node.href} from={from}>
            <Inlines nodes={node.children} from={from} />
          </DocLink>
        );
      default:
        return null;
    }
  });
}

/** A section heading with a `#` link to share its place; the link shows on hover or focus. */
function Heading({ block, from }: { block: Extract<Block, { kind: 'heading' }>; from: string }) {
  const Tag = block.level <= 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4';
  const size =
    Tag === 'h2'
      ? 'mt-8 border-t border-stroke-light pt-6 typo-heading-h5'
      : Tag === 'h3'
        ? 'mt-6 typo-body-medium-strong'
        : 'mt-4 typo-body-small-strong';
  return (
    <Tag id={block.id} className={`group flex items-baseline gap-2 ${size}`}>
      <span>
        <Inlines nodes={block.inline} from={from} />
      </span>
      <a
        href={`#${block.id}`}
        data-plain
        className="text-text-light opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="hash" />
        <VisuallyHidden>{block.text} 절 링크</VisuallyHidden>
      </a>
    </Tag>
  );
}

/** A fenced code block: its language (or "코드") on a bar with a copy button. */
function CodeBlock({ lang, text }: { lang: string; text: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-stroke-light bg-background-default">
      <div className="flex items-center justify-between border-b border-stroke-light px-3 py-1">
        <span className="typo-caption-small text-text-light">{lang || '코드'}</span>
        <CopyButton variant="icon" text={text} label="코드 복사" />
      </div>
      <pre className="devhub-code overflow-x-auto p-3">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function Blocks({ blocks, context }: { blocks: Block[]; context: Context }) {
  let caption = context.caption;
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'heading':
        caption = block.text;
        return <Heading key={index} block={block} from={context.from} />;
      case 'paragraph':
        return (
          <p key={index}>
            <Inlines nodes={block.inline} from={context.from} />
          </p>
        );
      case 'list': {
        const items = block.items.map((item, i) => (
          <li key={i}>
            {item.length === 1 && item[0].kind === 'paragraph' ? (
              <Inlines nodes={item[0].inline} from={context.from} />
            ) : (
              <Blocks blocks={item} context={{ ...context, caption }} />
            )}
          </li>
        ));
        return block.ordered ? (
          <ol key={index} start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={index}>{items}</ul>
        );
      }
      case 'table':
        return (
          <TableScroll
            key={index}
            label={caption}
            className="rounded-md border border-stroke-light"
          >
            <Table hiddenCaption>
              <caption>{caption}</caption>
              <thead>
                <tr>
                  {block.head.map((cell, i) => (
                    <th key={i} scope="col">
                      <Inlines nodes={cell} from={context.from} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>
                        <Inlines nodes={cell} from={context.from} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        );
      case 'code':
        return <CodeBlock key={index} lang={block.lang} text={block.text} />;
      case 'quote':
        return (
          <blockquote
            key={index}
            className="rounded-md border-l-4 border-stroke-primary bg-(--ds-background-selected) px-4 py-3"
          >
            <Blocks blocks={block.blocks} context={{ ...context, caption }} />
          </blockquote>
        );
      case 'rule':
        return <hr key={index} className="border-stroke-light" />;
      default:
        return null;
    }
  });
}

/** A repository document as a reading page: prose width, section anchors, tables, code. */
export function DocContent({
  blocks,
  from,
  title,
}: {
  blocks: Block[];
  from: string;
  title: string;
}) {
  return (
    <article className="devhub-prose max-w-[46rem]">
      <Blocks blocks={blocks} context={{ from, caption: title }} />
    </article>
  );
}
