import { ApprenticePanel } from '@/components/studio/ApprenticePanel';
import { RecordPanel } from '@/components/studio/RecordPanel';
import { TaughtToolsList } from '@/components/studio/TaughtToolsList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata = {
  title: 'Studio — Ginga',
};

export default function StudioPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Studio</h1>
        <p className="text-muted-foreground">Teach Ginga a new tool by showing, not coding.</p>
      </header>

      <Tabs defaultValue="teach">
        <TabsList>
          <TabsTrigger value="teach">Teach</TabsTrigger>
          <TabsTrigger value="apprentice">Apprentice</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>
        <TabsContent value="teach">
          <RecordPanel />
        </TabsContent>
        <TabsContent value="apprentice">
          <ApprenticePanel />
        </TabsContent>
        <TabsContent value="tools">
          <TaughtToolsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
