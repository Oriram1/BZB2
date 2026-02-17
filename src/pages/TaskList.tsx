import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bzbLogo from "@/assets/bzb-logo.png";

const categoryOptions = [
  { value: "all", label: "הכל" },
  { value: "housework", label: "🏠 עבודות בית" },
  { value: "gardening", label: "🌿 גינון" },
  { value: "babysitting", label: "👶 בייביסיטר" },
  { value: "pets", label: "🐾 חיות מחמד" },
  { value: "handyman", label: "🔧 הנדימן" },
  { value: "delivery", label: "🚚 משלוחים" },
  { value: "school", label: "📚 בית ספר" },
  { value: "tutoring", label: "👨‍🏫 שיעורים" },
  { value: "other", label: "📦 אחר" },
];

const mockTasks = [
  { id: 1, name: "ניקיון בית", shortDesc: "ניקיון כללי של דירה 3 חדרים", category: "housework", categoryLabel: "🏠 עבודות בית", payment: 80, paymentType: "task", location: "תל אביב, רח׳ דיזנגוף 50", date: "2026-02-20", time: "10:00", duration: 3, workers: 1, status: "open" },
  { id: 2, name: "טיול עם כלב", shortDesc: "טיול שעה עם גולדן רטריבר", category: "pets", categoryLabel: "🐾 חיות מחמד", payment: 40, paymentType: "hour", location: "הרצליה, פארק הנשיא", date: "2026-02-18", time: "16:00", duration: 1, workers: 1, status: "open" },
  { id: 3, name: "גיזום גינה", shortDesc: "גיזום עצים ושיחים בגינה", category: "gardening", categoryLabel: "🌿 גינון", payment: 60, paymentType: "hour", location: "רמת גן, רח׳ ביאליק 12", date: "2026-02-22", time: "08:00", duration: 4, workers: 2, status: "open" },
  { id: 4, name: "בייביסיטר ערב", shortDesc: "השגחה על 2 ילדים גילאי 4-7", category: "babysitting", categoryLabel: "👶 בייביסיטר", payment: 50, paymentType: "hour", location: "גבעתיים, רח׳ כצנלסון 8", date: "2026-02-19", time: "18:00", duration: 4, workers: 1, status: "open" },
  { id: 5, name: "עזרה במתמטיקה", shortDesc: "שיעור פרטי מתמטיקה לכיתה י׳", category: "tutoring", categoryLabel: "👨‍🏫 שיעורים פרטיים", payment: 70, paymentType: "hour", location: "פתח תקווה", date: "2026-02-21", time: "15:00", duration: 1.5, workers: 1, status: "open" },
  { id: 6, name: "משלוח חבילות", shortDesc: "איסוף ומסירה של 3 חבילות", category: "delivery", categoryLabel: "🚚 משלוחים", payment: 100, paymentType: "task", location: "ראשון לציון", date: "2026-02-18", time: "12:00", duration: 2, workers: 1, status: "open" },
];

const TaskList = () => {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [maxDistance, setMaxDistance] = useState(10);

  const filteredTasks =
    selectedCategory === "all"
      ? mockTasks
      : mockTasks.filter((t) => t.category === selectedCategory);

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />

      {/* Header */}
      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
            <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/create-task">
              <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 transition-transform duration-300">
                + פרסם מטלה
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 rounded-full font-semibold">
                מחירים
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 rounded-full font-semibold">
                כניסה
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-8 px-4 relative z-10">
        <h1 className="text-3xl font-extrabold text-foreground mb-6">מטלות זמינות 🐝</h1>

        {/* Filters */}
        <div className="glass rounded-3xl p-6 border border-border mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-bold text-muted-foreground mb-2 block">
              קבע מרחק (ק״מ): <span className="text-primary font-extrabold">{maxDistance}</span>
            </label>
            <input
              type="range"
              min={1}
              max={50}
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-bold text-muted-foreground mb-2 block">
              קטגוריה
            </label>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setSelectedCategory(c.value)}
                  className={`px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-300 border ${
                    selectedCategory === c.value
                      ? "gradient-honey text-primary-foreground border-transparent scale-105 shadow-honey"
                      : "bg-card text-foreground border-border hover:border-primary hover:scale-105"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Task Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {filteredTasks.map((task, i) => (
            <TaskCard key={task.id} task={task} index={i} />
          ))}
        </div>

        {filteredTasks.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-6xl mb-4">🔍</p>
            <p className="text-lg font-semibold">לא נמצאו מטלות בקטגוריה זו</p>
          </div>
        )}
      </div>
    </div>
  );
};

const TaskCard = ({ task, index }: { task: (typeof mockTasks)[0]; index: number }) => (
  <div
    className="bg-card rounded-3xl p-6 border border-border card-hover cursor-pointer group relative overflow-hidden"
    style={{ animationDelay: `${index * 0.05}s` }}
  >
    <div className="absolute inset-0 gradient-honey opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500" />
    <div className="flex items-start justify-between mb-3 relative">
      <div>
        <h3 className="font-extrabold text-lg text-foreground">{task.name}</h3>
        <p className="text-muted-foreground text-sm mt-1">{task.shortDesc}</p>
      </div>
      <Badge variant="secondary" className="text-xs shrink-0 rounded-xl font-bold">
        {task.categoryLabel}
      </Badge>
    </div>
    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mt-4">
      <div>💰 ₪{task.payment} / {task.paymentType === "hour" ? "שעה" : "משימה"}</div>
      <div>👥 {task.workers} עובדים</div>
      <div>📍 {task.location}</div>
      <div>📅 {task.date}</div>
      <div>🕐 {task.time}</div>
      <div>⏱️ {task.duration} שעות</div>
    </div>
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border relative">
      <Badge className="gradient-honey text-primary-foreground border-none rounded-xl font-bold">
        {task.status === "open" ? "פתוחה" : "סגורה"}
      </Badge>
      <Button size="sm" className="gradient-honey text-primary-foreground rounded-full border-none hover:scale-105 transition-transform duration-300 font-bold">
        אני מעוניין/ת
      </Button>
    </div>
  </div>
);

export default TaskList;
