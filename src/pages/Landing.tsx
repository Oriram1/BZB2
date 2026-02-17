import { Link } from "react-router-dom";
import bzbLogo from "@/assets/bzb-logo.png";
import heroBg from "@/assets/hero-bg.jpg";
import { Button } from "@/components/ui/button";

const Landing = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div
        className="relative flex-1 flex flex-col items-center justify-center text-center px-4 py-20"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/20 to-foreground/40" />
        <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl">
          <img
            src={bzbLogo}
            alt="BZB Logo"
            className="w-40 h-40 animate-float drop-shadow-2xl"
          />
          <h1 className="text-6xl md:text-7xl font-black text-primary-foreground tracking-tight">
            BZB
          </h1>
          <p className="text-xl md:text-2xl font-medium text-primary-foreground/90">
            Busy Bee
          </p>
          <p className="text-lg md:text-xl text-primary-foreground/80 italic">
            🐝 Your chores are their honey 🍯
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-6">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8 py-6 gradient-honey text-primary-foreground shadow-honey font-bold rounded-full border-none hover:opacity-90 transition-opacity">
                בואו נתחיל!
              </Button>
            </Link>
            <Link to="/tasks">
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 bg-card/90 text-foreground font-bold rounded-full border-2 border-primary-foreground/30 hover:bg-card transition-colors"
              >
                סיור כאורח
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="py-16 px-4 bg-card honeycomb-pattern">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            איך זה עובד? 🐝
          </h2>
          <div className="grid md:grid-cols-3 gap-8" dir="rtl">
            <FeatureCard
              emoji="📋"
              title="פרסם מטלה"
              description="פרסם מטלה, קבע תשלום והמתן להצעות מבני נוער חרוצים"
            />
            <FeatureCard
              emoji="🔍"
              title="חפש עבודה"
              description="עיין במטלות זמינות באזורך, בחר מה שמתאים לך והרוויח דמי כיס"
            />
            <FeatureCard
              emoji="🤝"
              title="התאמה מושלמת"
              description="מערכת דירוגים ומשובים מבטיחה חוויה בטוחה ואמינה לכולם"
            />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 px-4 bg-muted">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8 text-foreground">קטגוריות 🏠</h2>
          <div className="flex flex-wrap justify-center gap-3" dir="rtl">
            {["🏠 עבודות בית", "🌿 גינון", "👶 בייביסיטר", "🐾 חיות מחמד", "🔧 הנדימן", "🚚 משלוחים", "📚 מטלות בית ספר", "👨‍🏫 שיעורים פרטיים"].map(
              (cat) => (
                <span
                  key={cat}
                  className="px-5 py-2.5 rounded-full bg-card shadow-sm text-foreground font-medium border border-border hover:shadow-honey hover:border-primary transition-all cursor-default"
                >
                  {cat}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 gradient-honey text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-primary-foreground mb-4">
            מוכנים להתחיל? 🚀
          </h2>
          <p className="text-primary-foreground/80 mb-8 text-lg">
            הצטרפו לקהילת Busy Bee עוד היום
          </p>
          <Link to="/auth">
            <Button
              size="lg"
              className="text-lg px-8 py-6 bg-card text-foreground font-bold rounded-full hover:bg-card/90 transition-colors"
            >
              הירשמו עכשיו
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-4 bg-foreground text-center">
        <p className="text-background/70 text-sm">
          © 2026 Busy Bee (BZB). כל הזכויות שמורות. 🐝
        </p>
      </footer>
    </div>
  );
};

const FeatureCard = ({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) => (
  <div className="bg-card rounded-2xl p-8 text-center shadow-sm hover:shadow-honey transition-shadow border border-border">
    <div className="text-5xl mb-4">{emoji}</div>
    <h3 className="text-xl font-bold mb-2 text-foreground">{title}</h3>
    <p className="text-muted-foreground">{description}</p>
  </div>
);

export default Landing;
