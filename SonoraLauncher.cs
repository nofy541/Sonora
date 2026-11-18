using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;

internal sealed class Launcher : Window {
    readonly MusicInstall music = new MusicInstall(Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "YandexMusic"));
    readonly TextBlock status, details;
    readonly TextBlock updateStatus;
    readonly Button checkUpdates, openRelease;
    readonly Button primary, install, restore, refresh;
    readonly ProgressBar progress;
    readonly Grid page;
    MusicState state;
    bool busy, known;
    Version availableUpdate;
    const string Accent = "#C6FF4A";
    const string Text = "#EBEDE5";
    const string Muted = "#A1A79B";
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    [STAThread] static int Main(string[] args) {
        if ((args.Length == 3 || args.Length == 4) && args[0] == "--self-test") {
            try {
                MusicInstall.SelfTest(args[1], args[2], args.Length == 4 ? args[3] : null);
                VerifyChanges();
                File.AppendAllText(Path.Combine(args[2], "result.txt"), Environment.NewLine + "PASS: changelog panel opens, shows both sections, and closes.");
                LauncherUpdates.SelfTest();
                File.AppendAllText(Path.Combine(args[2], "result.txt"), Environment.NewLine + "PASS: update version comparison and invalid release rejection.");
                return 0;
            }
            catch (Exception ex) { File.WriteAllText(Path.Combine(args[2], "result.txt"), ex.ToString()); return 1; }
        }
        bool startup = args.Length == 1 && args[0] == LauncherUpdates.StartupArgument;
        Version update = null;
        if (startup) {
            try {
                if (!LauncherUpdates.StartsWithWindows) return 0;
                update = LauncherUpdates.CheckAsync().GetAwaiter().GetResult();
                if (update == null) return 0;
            } catch (Exception) { return 0; }
        }
        bool created;
        using (var instance = new System.Threading.Mutex(true, "Local\\SonoraLauncher", out created)) {
            if (!created) return 0;
            return new Application().Run(new Launcher(update));
        }
    }

    Launcher(Version startupUpdate) {
        Title = "Sonora Launcher";
        Width = 830; Height = 540; MinWidth = 670; MinHeight = 405;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = Brush("#0B0C0A");
        FontFamily = new FontFamily("IBM Plex Mono, Consolas, Segoe UI");
        Foreground = Brush(Text);
        UseLayoutRounding = true;
        UseDarkFrame(this);
        TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
        Resources.Add(typeof(Button), XamlReader.Parse(@"<Style xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation"" xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml"" TargetType=""Button"">
           <Setter Property=""Cursor"" Value=""Hand""/><Setter Property=""Padding"" Value=""14,8""/>
           <Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""Button"">
             <Border x:Name=""frame"" Background=""{TemplateBinding Background}"" BorderBrush=""{TemplateBinding BorderBrush}"" BorderThickness=""1"" Padding=""{TemplateBinding Padding}"">
               <ContentPresenter HorizontalAlignment=""Center"" VerticalAlignment=""Center"" RecognizesAccessKey=""True""/>
             </Border><ControlTemplate.Triggers>
               <Trigger Property=""IsMouseOver"" Value=""True""><Setter TargetName=""frame"" Property=""BorderBrush"" Value=""#C6FF4A""/></Trigger>
               <Trigger Property=""IsKeyboardFocused"" Value=""True""><Setter TargetName=""frame"" Property=""BorderThickness"" Value=""2""/><Setter TargetName=""frame"" Property=""BorderBrush"" Value=""#C6FF4A""/></Trigger>
               <Trigger Property=""IsPressed"" Value=""True""><Setter TargetName=""frame"" Property=""Opacity"" Value=""0.72""/></Trigger>
               <Trigger Property=""IsEnabled"" Value=""False""><Setter TargetName=""frame"" Property=""Opacity"" Value=""0.42""/></Trigger>
             </ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>"));

        var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        Content = scroll;
        page = new Grid { Margin = new Thickness(24, 22, 24, 14) };
        scroll.Content = page;
        foreach (var height in new[] {new GridLength(244), GridLength.Auto})
            page.RowDefinitions.Add(new RowDefinition { Height = height });

        var hero = new Grid { Background = Brush("#11140E"), ClipToBounds = true };
        hero.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(53, GridUnitType.Star) });
        hero.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(47, GridUnitType.Star) });
        var signal = new Signal { IsHitTestVisible = false };
        Grid.SetColumn(signal, 1); hero.Children.Add(signal);
        var header = new StackPanel { Margin = new Thickness(24, 12, 8, 12), VerticalAlignment = VerticalAlignment.Center };
        var headline = Label("Sonora", 60, Text, true); headline.Margin = new Thickness(-3, 0, 0, 1); header.Children.Add(headline);
        header.Children.Add(Label("Мод для Яндекс Музыки", 15, "#C6CABB"));
        status = Label("Проверяем файлы", 12, Muted, true);
        status.Margin = new Thickness(0, 24, 0, 0);
        header.Children.Add(status);
        hero.Children.Add(header);
        Put(page, new Border { BorderBrush = Brush("#343B26"), BorderThickness = new Thickness(1), Child = hero }, 0);

        var controls = new StackPanel { Margin = new Thickness(0, 17, 0, 0) };
        var actions = new WrapPanel();
        primary = ActionButton("Запустить Музыку", true); primary.Click += async delegate { await Primary(); };
        install = ActionButton("Установить Музыку", true); install.Click += async delegate { await Execute("Устанавливаем Яндекс Музыку…", music.InstallMusic); };
        restore = ActionButton("Вернуть оригинал", false); restore.Click += async delegate { await Execute("Возвращаем оригинальный клиент…", () => music.Apply(false)); };
        refresh = ActionButton("Обновить статус", false); refresh.Click += async delegate { await Execute("Проверяем установку…", null); };
        var whatsNew = ActionButton("Что нового", false);
        whatsNew.Click += delegate { CreateChangesWindow(this).ShowDialog(); };
        actions.Children.Add(primary); actions.Children.Add(install); actions.Children.Add(restore); actions.Children.Add(refresh);
        actions.Children.Add(whatsNew);
        controls.Children.Add(actions);
        progress = new ProgressBar { Height = 3, Margin = new Thickness(0, 4, 0, 4), Foreground = Brush(Accent), Background = Brush("#25291D"), Visibility = Visibility.Hidden };
        controls.Children.Add(progress);
        details = Label("", 12, Muted); details.MinHeight = 35;
        details.TextWrapping = TextWrapping.Wrap;
        System.Windows.Automation.AutomationProperties.SetLiveSetting(details, System.Windows.Automation.AutomationLiveSetting.Polite);
        controls.Children.Add(details);
        var updates = new WrapPanel();
        checkUpdates = ActionButton("Проверить обновления", false);
        checkUpdates.Click += async delegate { await CheckForUpdates(); };
        openRelease = ActionButton("Открыть релиз", true);
        openRelease.Visibility = Visibility.Collapsed;
        openRelease.Click += delegate {
            try { Process.Start(new ProcessStartInfo(LauncherUpdates.ReleaseUrl(availableUpdate)) { UseShellExecute = true }); }
            catch (Exception) { updateStatus.Text = "Не удалось открыть GitHub в браузере."; }
        };
        updates.Children.Add(checkUpdates);
        updates.Children.Add(openRelease);
        var startup = new CheckBox {
            Content = "Проверять при входе в Windows", Foreground = Brush(Text),
            Margin = new Thickness(4, 0, 8, 4), VerticalAlignment = VerticalAlignment.Center
        };
        updates.Children.Add(startup);
        controls.Children.Add(updates);
        updateStatus = Label("", 12, Muted);
        updateStatus.TextWrapping = TextWrapping.Wrap;
        System.Windows.Automation.AutomationProperties.SetLiveSetting(updateStatus, System.Windows.Automation.AutomationLiveSetting.Polite);
        controls.Children.Add(updateStatus);
        string executable = typeof(Launcher).Assembly.Location;
        try {
            startup.IsChecked = LauncherUpdates.StartsWithWindows;
            LauncherUpdates.ConfigureStartup(startup.IsChecked == true, executable);
        } catch (Exception) {
            startup.IsChecked = false;
            startup.ToolTip = "Windows не дала настроить автозапуск.";
        }
        startup.Click += delegate {
            try { LauncherUpdates.ConfigureStartup(startup.IsChecked == true, executable); }
            catch (Exception) {
                startup.IsChecked = startup.IsChecked != true;
                updateStatus.Text = "Не удалось изменить автозапуск.";
            }
        };
        Put(page, controls, 1);
        UpdateUI();
        Loaded += async delegate {
            if (SystemParameters.ClientAreaAnimation) {
                page.BeginAnimation(OpacityProperty, new DoubleAnimation(.35, 1, TimeSpan.FromMilliseconds(240)));
                var slide = new TranslateTransform(); page.RenderTransform = slide;
                slide.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(9, 0, TimeSpan.FromMilliseconds(240)) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
            }
            if (startupUpdate != null) ShowUpdate(startupUpdate);
            await Task.WhenAll(Execute("Проверяем установку…", null),
                startupUpdate == null ? CheckForUpdates() : Task.FromResult(0));
        };
        Closing += (sender, e) => { if (busy) e.Cancel = true; };
    }

    async Task CheckForUpdates() {
        checkUpdates.IsEnabled = false;
        updateStatus.Text = "Проверяем GitHub…";
        try { ShowUpdate(await LauncherUpdates.CheckAsync()); }
        catch (Exception) { updateStatus.Text = "GitHub недоступен. Повторите проверку позже."; }
        finally { checkUpdates.IsEnabled = true; }
    }

    void ShowUpdate(Version update) {
        availableUpdate = update;
        openRelease.Visibility = update == null ? Visibility.Collapsed : Visibility.Visible;
        updateStatus.Text = update == null
            ? "Установлена актуальная версия Sonora " + Package.LauncherVersion + "."
            : "Доступна Sonora " + update + ".";
    }

    static void UseDarkFrame(Window window) {
        window.SourceInitialized += delegate {
            int dark = 1;
            DwmSetWindowAttribute(new System.Windows.Interop.WindowInteropHelper(window).Handle, 20, ref dark, sizeof(int));
        };
    }
    static Window CreateChangesWindow(Window owner) {
        var window = new Window {
            Title = "Что нового", Owner = owner, Width = 525, Height = 510, MinHeight = 385,
            MinWidth = 400, ShowInTaskbar = false, Background = Brush("#0B0C0A"),
            Foreground = Brush(Text), WindowStartupLocation = owner == null ? WindowStartupLocation.CenterScreen : WindowStartupLocation.CenterOwner,
            FontFamily = new FontFamily("IBM Plex Mono, Consolas, Segoe UI")
        };
        if (owner != null) window.Resources[typeof(Button)] = owner.Resources[typeof(Button)];
        UseDarkFrame(window);
        var layout = new DockPanel { Margin = new Thickness(23, 20, 23, 17) };
        window.Content = layout;
        var heading = Label("Что нового", 28, Text, true);
        heading.Margin = new Thickness(0, 0, 0, 17);
        DockPanel.SetDock(heading, Dock.Top);
        layout.Children.Add(heading);
        var close = ActionButton("Закрыть", true);
        close.HorizontalAlignment = HorizontalAlignment.Right;
        close.IsCancel = true;
        close.Click += delegate { window.Close(); };
        DockPanel.SetDock(close, Dock.Bottom);
        layout.Children.Add(close);
        var log = new StackPanel();
        layout.Children.Add(new ScrollViewer { Content = log, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled });
        AddChanges(log, "Лаунчер",
            "Проверка релизов GitHub при открытии лаунчера и при входе в Windows.",
            "Компактное окно с анимированной Волной.",
            "Установка Sonora, запуск Музыки и возврат к оригиналу из одного окна.");
        AddChanges(log, "Яндекс Музыка",
            "Поддержка официальной версии " + Package.MusicVersion + ".",
            "16 встроенных наборов иконок для плеера, сайдбара и эскиза на панели задач.",
            "Полноэкранный плеер открывается прямо с панели «Моей волны».",
            "Обои продолжают играть при переходе в полноэкранный плеер и обратно.",
            "Видео YouTube в обоях, с зацикливанием и без звука.",
            "Редактор раскладки с отдельными материалами для сайдбара, плеера и карточек.",
            "Два способа проявления букв в синхронизированных текстах, с лёгким свечением.",
            "Управление, лайк и дизлайк в эскизе Музыки на панели задач.",
            "Кольцо NCS реагирует на частоты музыки и затихает на паузе.",
            "Кнопка настроек Sonora со скруглением перед кнопкой сворачивания окна.");
        return window;
    }
    static void AddChanges(StackPanel log, string section, params string[] entries) {
        var title = Label(section, 14, Accent, true);
        title.Margin = new Thickness(0, 0, 0, 6);
        log.Children.Add(title);
        foreach (string entry in entries) {
            var line = Label("•  " + entry, 13, Text);
            line.TextWrapping = TextWrapping.Wrap;
            line.Margin = new Thickness(0, 0, 10, 6);
            log.Children.Add(line);
        }
        log.Children.Add(new Border { Height = 11 });
    }
    static void VerifyChanges() {
        var window = CreateChangesWindow(null);
        window.ShowActivated = false;
        window.Show();
        var panel = (DockPanel)window.Content;
        var list = (StackPanel)((ScrollViewer)panel.Children[2]).Content;
        bool created = window.IsVisible &&
            list.Children.OfType<TextBlock>().Any(row => row.Text == "Лаунчер") &&
            list.Children.OfType<TextBlock>().Any(row => row.Text == "Яндекс Музыка");
        ((Button)panel.Children[1]).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        if (!created || window.IsVisible) throw new Exception("Changelog UI could not be opened or dismissed.");
    }

    async Task Primary() {
        if (!known || busy) return;
        if (state == MusicState.Original || state == MusicState.Older) await Execute("Устанавливаем Sonora…", () => music.Apply(true));
        else {
            try { music.Launch(); }
            catch (Exception error) { details.Text = error.Message; details.Foreground = Brush("#FF9D95"); }
        }
    }
    async Task Execute(string message, Action action) {
        if (busy) return;
        busy = true; UpdateUI(); Details(message, false);
        string failure = null;
        try {
            if (action != null) await Task.Run(action);
        } catch (Exception error) { failure = error.Message; }
        try { state = await Task.Run(() => music.Inspect()); known = true; }
        catch (Exception error) { known = false; failure = failure ?? error.Message; }
        busy = false; UpdateUI();
        if (failure != null) Details(failure, true);
        else if (state == MusicState.Modded) Details("Яндекс Музыка " + Package.MusicVersion, false);
        else if (state == MusicState.Original) Details("Музыка готова к установке Sonora. Для замены файлов закройте Музыку в трее.", false);
        else if (state == MusicState.Older) Details("В комплекте есть более свежая сборка Sonora. Закройте Музыку, чтобы обновиться.", false);
        else if (state == MusicState.Missing) Details("В комплект входит официальный установщик Яндекс Музыки " + Package.MusicVersion + ".", false);
        else Details("Эта установка отличается от совместимой сборки " + Package.MusicVersion + ". Обновите Музыку и нажмите «Обновить статус».", false);
    }
    void Details(string message, bool error) { details.Text = message; details.Foreground = Brush(error ? "#FF9D95" : Muted); }
    void UpdateUI() {
        bool missing = known && state == MusicState.Missing;
        install.Visibility = missing ? Visibility.Visible : Visibility.Collapsed;
        install.IsEnabled = missing && !busy;
        primary.Visibility = missing ? Visibility.Collapsed : Visibility.Visible;
        primary.IsEnabled = known && !busy && File.Exists(music.Exe);
        primary.Content = known && state == MusicState.Original ? "Установить Sonora" : known && state == MusicState.Older ? "Обновить Sonora" : "Запустить Музыку";
        restore.Visibility = known && (state == MusicState.Modded || state == MusicState.Older) ? Visibility.Visible : Visibility.Collapsed;
        restore.IsEnabled = !busy;
        refresh.Visibility = !known || state == MusicState.Unsupported || state == MusicState.Missing ? Visibility.Visible : Visibility.Collapsed;
        refresh.IsEnabled = !busy;
        progress.Visibility = busy ? Visibility.Visible : Visibility.Hidden;
        progress.IsIndeterminate = busy;
        status.Foreground = Brush(known && state == MusicState.Modded && !busy ? Accent : Muted);
        status.Text = busy ? "Подготовка…" : !known ? "Проверка нужна" : state == MusicState.Modded ? "Установлен" :
            state == MusicState.Original ? "Доступен" : state == MusicState.Older ? "Есть обновление" : state == MusicState.Missing ? "Нужна Музыка" : "Несовместим";
    }
    static Button ActionButton(string text, bool main) {
        return new Button { Content = text, MinHeight = 40, FontWeight = FontWeights.SemiBold, FontSize = 13,
            Margin = new Thickness(0, 0, 8, 4), Background = Brush(main ? Accent : "#171A14"),
            Foreground = Brush(main ? "#101507" : Text), BorderBrush = Brush(main ? Accent : "#3A4234") };
    }
    internal static SolidColorBrush Brush(string value) {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(value)); brush.Freeze(); return brush;
    }
    static TextBlock Label(string value, double size, string color, bool bold = false) {
        return new TextBlock { Text = value, FontSize = size, Foreground = Brush(color), FontWeight = bold ? FontWeights.Bold : FontWeights.Normal };
    }
    static void Put(Grid grid, UIElement value, int row) { Grid.SetRow(value, row); grid.Children.Add(value); }
}

internal sealed class Signal : FrameworkElement {
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly System.Windows.Threading.DispatcherTimer timer;
    readonly Pen gridPen = new Pen(Launcher.Brush("#222A18"), 1);
    public Signal() {
        timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
        timer.Tick += delegate { InvalidateVisual(); };
        IsVisibleChanged += (sender, e) => { if (IsVisible && SystemParameters.ClientAreaAnimation) timer.Start(); else timer.Stop(); };
        Unloaded += (sender, e) => timer.Stop();
    }
    protected override void OnRender(DrawingContext dc) {
        double w = ActualWidth, h = ActualHeight;
        if (w <= 0 || h <= 0) return;
        double t = SystemParameters.ClientAreaAnimation ? clock.Elapsed.TotalSeconds : 0;
        double cx = w * .51, cy = h * .5;
        double sizing = Math.Min(1, w / 340);
        for (double x = 22; x < w; x += 28) dc.DrawLine(gridPen, new Point(x, 0), new Point(x, h));
        for (double y = 22; y < h; y += 28) dc.DrawLine(gridPen, new Point(0, y), new Point(w, y));
        for (int ring = 0; ring < 5; ring++) {
            var geometry = new StreamGeometry();
            using (var context = geometry.Open()) {
                for (int i = 0; i <= 144; i++) {
                    double angle = i * Math.PI * 2 / 144;
                    double radius = 64 + ring * 11;
                    radius += Math.Sin(angle * 6 - t * 1.8 + ring * .65) * (9 + ring) + Math.Cos(angle * 11 + t * 1.2) * 3;
                    var point = new Point(cx + Math.Cos(angle) * radius * 1.26 * sizing, cy + Math.Sin(angle) * radius * .82 * sizing);
                    if (i == 0) context.BeginFigure(point, false, true); else context.LineTo(point, true, false);
                }
            }
            var pen = new Pen(Launcher.Brush(ring == 4 ? "#C6FF4A" : ring == 3 ? "#829F3E" : "#415725"), ring == 4 ? 1.7 : 1);
            dc.DrawGeometry(null, pen, geometry);
        }
        dc.DrawLine(new Pen(Launcher.Brush("#5D7534"), 1), new Point(cx - 7, cy), new Point(cx + 7, cy));
        dc.DrawLine(new Pen(Launcher.Brush("#5D7534"), 1), new Point(cx, cy - 7), new Point(cx, cy + 7));
    }
}
