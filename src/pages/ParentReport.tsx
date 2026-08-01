import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays, Coins, Shield } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatLongDate } from "@/lib/format";

type DigestCard = { title: string; lines: string[] };

type Digest = {
  date: string;
  summary?: string;
  total_earned?: number;
  cards: DigestCard[];
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return isoDate(next);
}

/**
 * The screen a daily-report notification opens into.
 *
 * It reads the digest that was actually sent rather than recomputing it, so
 * what the parent reads here is exactly what landed in their inbox.
 */
const ParentReport = () => {
  const { date } = useParams<{ date: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = useMemo(() => isoDate(new Date()), []);
  const activeDate = date ?? today;

  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, data")
        .eq("user_id", user.id)
        .eq("event_type", "parent_digest")
        .eq("data->>date", activeDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setDigest(data ? ((data.data ?? null) as Digest | null) : null);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, activeDate, navigate]);

  const cards = digest?.cards ?? [];
  const earned = Number(digest?.total_earned) || 0;

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader title="דוח יומי" icon={<Shield size={18} />} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Day navigation. In RTL the "previous day" control sits on the right. */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full font-bold gap-1"
            onClick={() => navigate(`/parent/report/${shiftDate(activeDate, -1)}`)}
          >
            <ChevronRight size={16} />
            יום קודם
          </Button>

          <span className="flex items-center gap-1.5 text-sm font-bold text-foreground text-center">
            <CalendarDays size={15} className="text-primary-ink" />
            {formatLongDate(activeDate)}
          </span>

          <Button
            variant="outline"
            size="sm"
            className="rounded-full font-bold gap-1"
            disabled={activeDate >= today}
            onClick={() => navigate(`/parent/report/${shiftDate(activeDate, 1)}`)}
          >
            יום הבא
            <ChevronLeft size={16} />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((index) => <Skeleton key={index} className="h-40 w-full rounded-3xl" />)}
          </div>
        ) : cards.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center">
              <p className="text-4xl mb-3">🐝</p>
              <p className="font-bold text-foreground mb-1">אין דוח ליום הזה</p>
              <p className="text-sm text-muted-foreground">
                דוח נשלח רק בימים שבהם הייתה פעילות.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {earned > 0 && (
              <Card className="border-border overflow-hidden">
                <div className="gradient-honey h-1.5" />
                <CardContent className="py-5 flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-accent/30 flex items-center justify-center shrink-0">
                    <Coins size={20} className="text-primary-ink" />
                  </span>
                  <div>
                    <p className="text-sm text-muted-foreground">סה״כ הרווחים היום</p>
                    <p className="text-2xl font-extrabold text-foreground tabular">
                      {formatCurrency(earned)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {cards.map((card, index) => (
              <Card key={`${card.title}-${index}`} className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="relative space-y-3 pr-4 border-r-2 border-border">
                    {card.lines.map((line, lineIndex) => (
                      <li key={lineIndex} className="relative text-sm text-foreground leading-relaxed">
                        <span
                          aria-hidden="true"
                          className="absolute -right-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary"
                        />
                        {line}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        <Button
          variant="outline"
          className="w-full rounded-2xl font-bold h-12"
          onClick={() => navigate("/parent")}
        >
          למרכז ההורים
        </Button>
      </div>
    </div>
  );
};

export default ParentReport;
