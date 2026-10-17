import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { CliBridgeService } from './services/cli-bridge.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [CliBridgeService],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render LCARS DESKTOP title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('LCARS DESKTOP');
  });

  it('should have initial active subsystem as desktop', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.activeSubsystem()).toBe('desktop');
  });

  it('should switch subsystems when requested', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    
    app.selectSubsystem('ops');
    expect(app.activeSubsystem()).toBe('ops');

    app.selectSubsystem('sensors');
    expect(app.activeSubsystem()).toBe('sensors');

    app.selectSubsystem('nav');
    expect(app.activeSubsystem()).toBe('nav');

    app.selectSubsystem('database');
    expect(app.activeSubsystem()).toBe('database');
  });

  it('should filter imported desktop items by type and search query', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    
    const allItems = app.filteredDesktopItems();
    expect(allItems.length).toBeGreaterThan(0);

    app.desktopFilter.set('shortcut');
    const shortcuts = app.filteredDesktopItems();
    expect(shortcuts.every((item) => item.item_type === 'shortcut')).toBeTrue();

    app.desktopSearch = 'Atlas';
    const searched = app.filteredDesktopItems();
    expect(searched.every((item) => item.name.includes('Atlas'))).toBeTrue();
  });

  it('should compute valid stardate and clock signals', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.stardate()).toMatch(/^\d{5}\.\d$/);
    expect(app.clock()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('should allow selecting starships in the database', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const voyager = app.starships.find((s) => s.name.includes('VOYAGER'));
    expect(voyager).toBeDefined();
    if (voyager) {
      app.selectShip(voyager);
      expect(app.selectedShip().name).toContain('VOYAGER');
    }
  });

  it('should format uptime seconds into readable hh:mm:ss format', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.formatUptime(3665)).toBe('01:01:05');
  });

  it('should update theme profile', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.setTheme('nemesis');
    expect(app.currentTheme()).toBe('nemesis');
  });
});
