import { notFound } from 'next/navigation';

/** Both slots match every URL under this layout; a slot that cannot be restored is a 404. */
export default function Default() {
  notFound();
}
