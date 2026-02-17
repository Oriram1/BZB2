import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bzbLogo from "@/assets/bzb-logo.png";

const myTasks = [
  {
    id: 1, name: "ניקיון בית", shortDesc: "ניקיון כללי של דירה 3 חדרים", views: 24,
    interested: [{ name: "יוסי כ.", age: 16 }, { name: "שירה ל.", age: 17 }], status: "open",
  },
  {
    id: 2, name: "טיול עם כלב", shortDesc: "טיול שעה עם גולדן רטריבר", views: 12,
    interested: [{ name: "דני מ.", age: 15 }], status: "open",
  },
];

const MyTasks = () => {
  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
            <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
          </Link>
          <Link to="/create-task">
            <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 transition-transform duration-300">
              + מטלה חדשה
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto py-8 px-4 relative z-10">
        <h1 className="text-3xl font-extrabold text-foreground mb-6">המטלות שלי 📋</h1>

        <div className="flex flex-col gap-4">
          {myTasks.map((task) => (
            <div
              key={task.id}
              className="bg-card rounded-3xl p-6 border border-border card-hover"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-extrabold text-lg text-foreground">{task.name}</h3>
                  <p className="text-muted-foreground text-sm">{task.shortDesc}</p>
                </div>
                <Badge className="gradient-honey text-primary-foreground border-none rounded-xl font-bold">
                  {task.status === "open" ? "פתוחה" : "סגורה"}
                </Badge>
              </div>

              <div className="text-sm text-muted-foreground mb-4 font-semibold">
                👁️ {task.views} צפיות
              </div>

              {task.interested.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-bold text-foreground mb-3">
                    מעוניינים ({task.interested.length}):
                  </p>
                  <div className="flex flex-col gap-2">
                    {task.interested.map((person, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-muted rounded-2xl p-3"
                      >
                        <div>
                          <span className="font-bold text-foreground">{person.name}</span>
                          <span className="text-muted-foreground text-sm mr-2">
                            גיל {person.age}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gradient-honey text-primary-foreground rounded-full border-none hover:scale-105 transition-transform duration-300 font-bold"
                          >
                            קבל ✓
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full border-border text-muted-foreground hover:text-destructive hover:border-destructive font-semibold"
                          >
                            דחה ✕
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-border text-foreground font-bold hover:scale-105 transition-transform duration-300"
                >
                  ערוך מטלה ✏️
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyTasks;
