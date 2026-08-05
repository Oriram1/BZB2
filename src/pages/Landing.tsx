import { Link } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { categories } from "@/lib/categories";
const Landing = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col overflow-hidden">
      {/* Hero Section */}
      <div
        className="relative flex-1 flex flex-col items-center justify-center text-center px-4 py-24 min-h-[90vh]"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}>
        
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 gradient-hero opacity-80" />
        
        {/* Floating blobs for energy */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/20 rounded-full blur-3xl animate-blob" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/15 rounded-full blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-secondary/20 rounded-full blur-3xl animate-blob animation-delay-4000" />

        <div className="relative z-10 flex flex-col items-center gap-5 max-w-2xl">
          <img

            alt="BZB Logo"
            className="w-36 h-36 animate-float drop-shadow-2xl" src="/lovable-uploads/2dbef5fd-0953-4d8c-acee-47c58e45b35a.jpg" />
          
          

          
          <p className="text-2xl md:text-3xl font-bold text-primary-foreground/95 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Busy Bee
          </p>
          {/* English tagline: keep LTR so the emoji stay at the intended ends */}
          <p dir="ltr" className="text-lg md:text-xl text-primary-foreground/85 font-medium animate-slide-up" style={{ animationDelay: "0.2s" }}>
            🐝 Your chores are their honey 🍯
          </p>
          {user ? (
            <div className="flex flex-col sm:flex-row gap-4 mt-8 animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <Link to="/tasks">
                <Button size="lg" className="min-h-12 text-lg px-10 py-7 bg-white text-primary-ink shadow-glow font-extrabold rounded-full border-2 border-white hover:bg-white/90 hover:scale-105 transition-transform duration-300">
                  למטלות 📋
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 mt-8 animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <Link to="/auth">
                <Button size="lg" className="min-h-12 text-lg px-10 py-7 bg-white text-primary-ink shadow-glow font-extrabold rounded-full border-2 border-white hover:bg-white/90 hover:scale-105 transition-transform duration-300">
                  בואו נתחיל! 🚀
                </Button>
              </Link>
              <Link to="/tasks">
                <Button
                  size="lg"
                  variant="outline"
                  className="min-h-12 text-lg px-10 py-7 bg-white text-primary-ink font-bold rounded-full border-2 border-white hover:bg-white/90 hover:scale-105 transition-transform duration-300">
                  סיור כאורח 👀
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Scroll indicator */}
        <div
          className="absolute bottom-8 flex flex-col items-center space-y-[-14px] opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
          <svg className="w-8 h-8 text-primary-foreground animate-[bounce_2s_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
          <svg className="w-8 h-8 text-primary-foreground/70 animate-[bounce_2s_infinite_200ms]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
          <svg className="w-8 h-8 text-primary-foreground/40 animate-[bounce_2s_infinite_400ms]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Features Section */}
      <section id="how-it-works" className="py-20 px-4 bg-card relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        
        <div className="max-w-5xl mx-auto relative">
          <h2 className="text-4xl font-extrabold text-center mb-4 text-foreground">
            איך זה עובד?
          </h2>
          <p className="text-center text-muted-foreground text-lg mb-14">פשוט, מהיר, ומשתלם 🐝</p>
          <div className="grid md:grid-cols-3 gap-6" dir="rtl">
            <FeatureCard
              emoji="📋"
              title="פרסם מטלה"
              description="פרסם מטלה, קבע תשלום והמתן להצעות מבני נוער חרוצים"
              delay={0} />
            
            <FeatureCard
              emoji="🔍"
              title="חפש עבודה"
              description="עיין במטלות זמינות באזורך, בחר מה שמתאים לך והרוויח דמי כיס"
              delay={1} />
            
            <FeatureCard
              emoji="🤝"
              title="התאמה מושלמת"
              description="מערכת דירוגים ומשובים מבטיחה חוויה בטוחה ואמינה לכולם"
              delay={2} />
            
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 px-4 bg-muted">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-extrabold mb-4 text-foreground">קטגוריות</h2>
          <p className="text-muted-foreground text-lg mb-10">מה צריכים? יש לנו!</p>
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.value}
                  to="/tasks"
                  className="flex items-center gap-2 px-6 py-3 min-h-11 rounded-2xl bg-card shadow-sm text-foreground font-semibold border border-border card-hover text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Icon size={18} className="text-primary-ink" aria-hidden="true" />
                  {cat.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 gradient-honey text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-primary-foreground/5 honeycomb-pattern" />
        <div className="max-w-2xl mx-auto relative">
          <h2 className="text-4xl font-extrabold text-primary-foreground mb-4">
            מוכנים להתחיל? 🚀
          </h2>
          <p className="text-primary-foreground/80 mb-10 text-lg">
            הצטרפו לקהילת Busy Bee עוד היום
          </p>
          <Link to="/auth">
            <Button
              size="lg"
              className="min-h-12 text-lg px-10 py-7 bg-white text-primary-ink font-extrabold rounded-full border-2 border-white hover:bg-white/90 hover:scale-105 transition-transform duration-300 shadow-glow">
              
              הירשמו עכשיו 🐝
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-foreground text-center" dir="rtl">
        <div className="flex justify-center gap-4 mb-3">
          <Link to="/terms" className="text-background/70 text-sm font-medium hover:text-background underline transition-colors">
            תקנון ותנאי שימוש
          </Link>
          <span className="text-background/40">|</span>
          <Link to="/privacy" className="text-background/70 text-sm font-medium hover:text-background underline transition-colors">
            מדיניות פרטיות
          </Link>
        </div>
        <p className="text-background/60 text-sm font-medium">
          © 2026 Busy Bee (BZB). כל הזכויות שמורות. 🐝
        </p>
      </footer>
    </div>);

};

const FeatureCard = ({
  emoji,
  title,
  description,
  delay





}: {emoji: string;title: string;description: string;delay: number;}) =>
<div
  className="bg-card rounded-3xl p-8 text-center card-hover border border-border relative overflow-hidden group">
  
    <div className="absolute inset-0 gradient-honey opacity-0 group-hover:opacity-5 transition-opacity duration-500" />
    <div className="text-5xl mb-5 group-hover:animate-buzz">{emoji}</div>
    <h3 className="text-xl font-extrabold mb-3 text-foreground">{title}</h3>
    <p className="text-muted-foreground leading-relaxed">{description}</p>
  </div>;


export default Landing;
