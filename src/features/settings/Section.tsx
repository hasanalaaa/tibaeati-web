import type { ReactNode } from 'react';
import { Card } from '@/ui';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-3">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      {children}
    </Card>
  );
}
