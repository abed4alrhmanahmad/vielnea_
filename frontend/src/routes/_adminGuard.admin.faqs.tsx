import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAdminFaqs, faqsService, type AdminFaq } from "@/admin/services/faqs-admin";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/faqs")({
  head: () => ({
    meta: [{ title: "FAQ — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: FaqsPage,
});

function FaqsPage() {
  const { enabled, sectionId, eyebrow, heading, description, faqs } = useAdminFaqs();
  const [editing, setEditing] = useState<AdminFaq | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="FAQ"
        description="Questions shown on the FAQ page and the About page"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add FAQ
          </Button>
        }
      />

      {/* Section-level switch. Separate from each question's Active toggle:
          this hides the whole section, and never deletes anything. */}
      <Card className="mb-6">
        <CardContent className="flex items-center justify-between gap-6 py-4">
          <div>
            <p className="font-medium">Show the FAQ section</p>
            <p className="text-sm text-muted-foreground">
              Turning this off hides the FAQ from both the FAQ page and the About page. Your
              questions stay saved and reappear when you turn it back on.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={!sectionId}
            aria-label="Show the FAQ section"
            onCheckedChange={(v) => {
              if (sectionId) faqsService.setEnabled(sectionId, v);
            }}
          />
        </CardContent>
      </Card>

      <FaqHeaderForm
        sectionId={sectionId}
        eyebrow={eyebrow}
        heading={heading}
        description={description}
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Order</th>
                <th>Question</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {faqs.map((f) => (
                <tr key={f.id} className="border-b border-border/60 last:border-b-0">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button aria-label="Move up" onClick={() => faqsService.reorder(f.id, -1)}>
                          <ArrowUp className="size-3" />
                        </button>
                        <button aria-label="Move down" onClick={() => faqsService.reorder(f.id, 1)}>
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                      <span className="text-muted-foreground font-mono text-xs">
                        {f.displayOrder}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{f.question}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{f.answer}</div>
                  </td>
                  <td>
                    <Switch
                      checked={f.isActive}
                      aria-label={`Show "${f.question}"`}
                      onCheckedChange={(v) => faqsService.update(f.id, { isActive: v })}
                    />
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete "${f.question}"?`)) faqsService.remove(f.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {faqs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No FAQs yet — add one to start the list.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <FaqEditor
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * The section's eyebrow / heading / description. These live on the CMS `faq`
 * section — the same record the switch writes to — so this form saves through
 * the existing section endpoint rather than a new one.
 */
function FaqHeaderForm({
  sectionId,
  eyebrow,
  heading,
  description,
}: {
  sectionId: string | null;
  eyebrow: string;
  heading: string;
  description: string;
}) {
  const [eyebrowText, setEyebrowText] = useState(eyebrow);
  const [title, setTitle] = useState(heading);
  const [body, setBody] = useState(description);

  // The values arrive with the query, so seed the fields once they land (and
  // again if another tab changes them).
  useEffect(() => {
    setEyebrowText(eyebrow);
    setTitle(heading);
    setBody(description);
  }, [eyebrow, heading, description]);

  const dirty = eyebrowText !== eyebrow || title !== heading || body !== description;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="font-medium">Section header</p>
          <p className="text-sm text-muted-foreground">
            Shown above the questions. The description appears on the FAQ page.
          </p>
        </div>
        <div>
          <Label>Eyebrow</Label>
          <Input
            value={eyebrowText}
            onChange={(e) => setEyebrowText(e.target.value)}
            placeholder="Small line above the heading"
          />
        </div>
        <div>
          <Label>Heading</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The section title"
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="A sentence introducing the questions"
          />
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!sectionId || !dirty}
            onClick={() => {
              if (sectionId) {
                faqsService.saveHeader(sectionId, {
                  eyebrow: eyebrowText,
                  heading: title,
                  description: body,
                });
              }
            }}
          >
            Save header
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FaqEditor({ initial, onClose }: { initial: AdminFaq | null; onClose: () => void }) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? ""));

  function save() {
    if (!question.trim()) {
      toast.error("A question is required");
      return;
    }

    const draft = { question: question.trim(), answer, isActive };

    if (initial) {
      const order = Number.parseInt(displayOrder, 10);
      faqsService.update(initial.id, {
        ...draft,
        ...(Number.isFinite(order) && order >= 0 ? { displayOrder: order } : {}),
      });
    } else {
      faqsService.create(draft);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit" : "New"} FAQ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Question</Label>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div>
            <Label>Answer</Label>
            <Textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Plain text. It is shown exactly as typed when the question is expanded.
            </p>
          </div>
          {initial && (
            <div>
              <Label>Display order</Label>
              <Input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} /> Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
