import { ApprenticePanel } from '@/components/studio/ApprenticePanel';
import { RecordPanel } from '@/components/studio/RecordPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata = {
  title: 'Studio — Ginga',
};

export default function StudioPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <p className="text-muted-foreground">Teach Ginga a new tool by showing, not coding.</p>
      </header>

      <Tabs defaultValue="teach">
        <TabsList>
          <TabsTrigger value="teach">Teach</TabsTrigger>
          <TabsTrigger value="apprentice">Apprentice</TabsTrigger>
        </TabsList>
        <TabsContent value="teach">
          <RecordPanel />
        </TabsContent>
        <TabsContent value="apprentice">
          <ApprenticePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
