# いつかやること: 通知ウィンドウ「ふきだし」(WPF / PowerShell 5.1)。index.mjs から呼ばれる。見た目は mock-dialog-cute.html の .v2。
# -Json: 表示内容(index.mjs が作る)  -Icon: ペンギンのアイコン PNG  -Shot: 見た目確認用(画面を PNG 保存して閉じる)
# -AutoSeq: 確認用。指定した行番号のチェックを順に押す(例 "0,1,0")
# チェックを押すと標準出力に「DONE <id>」/「UNDONE <id>」を書き、標準入力で「OK <id>」/「ERR <id>」を受け取る。
param([Parameter(Mandatory)][string]$Json, [string]$Icon, [string]$Shot, [string]$AutoSeq)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms
Add-Type -Namespace SomedayNotify -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
'@

$v = [IO.File]::ReadAllText($Json, [Text.Encoding]::UTF8) | ConvertFrom-Json

$ink = '#2E2A4A'; $purple = '#8A6FE0'; $pink = '#E5559C'; $red = '#DD4670'; $mute = '#7A6F9A'; $dot = '#E6DEF8'; $stampC = '#D9466F'

function Row($i, $it, $last) {
  $over = ($it.dueCls -eq 'over')
  if ($over) { $ring = $red; $dueC = $red; $dueW = 'ExtraBold' }
  else {
    $ring = '#B9A6EE'
    if ($it.dueCls -eq 'soon') { $dueC = $purple; $dueW = 'ExtraBold' } else { $dueC = $mute; $dueW = 'Medium' }
  }
  $seal = ''
  if ($it.labelKey) {
    $c = if ($it.labelKey -eq 'work') { $purple } else { $pink }
    $seal = @"
<Grid x:Name='g$i' Margin='4,0,2,0' VerticalAlignment='Center' HorizontalAlignment='Center' RenderTransformOrigin='0.5,0.5'>
  <Grid.RenderTransform><RotateTransform Angle='-6'/></Grid.RenderTransform>
  <Border BorderBrush='$c' BorderThickness='1.5' CornerRadius='8' Padding='9,3'><TextBlock x:Name='l$i' FontSize='10.5' FontWeight='ExtraBold' Foreground='$c'/></Border>
  <Rectangle Margin='2.5' RadiusX='5' RadiusY='5' Stroke='$c' StrokeThickness='1' StrokeDashArray='3 2' Opacity='0.55' IsHitTestVisible='False'/>
</Grid>
"@
  }
  $memo = ''
  if ($it.hasNote) { $memo = "<Path Margin='6,3,0,0' Width='11' Height='11' Stretch='Uniform' Stroke='$mute' StrokeThickness='1.6' Opacity='0.7' VerticalAlignment='Center' ToolTip='メモあり' Data='M4,3 H12 A1.5,1.5 0 0 1 13.5,4.5 V11.5 A1.5,1.5 0 0 1 12,13 H4 A1.5,1.5 0 0 1 2.5,11.5 V4.5 A1.5,1.5 0 0 1 4,3 Z M5.5,6.5 H10.5 M5.5,9.5 H10.5'/>" }
  $sep = ''
  if (-not $last) { $sep = "<Grid Height='2' ClipToBounds='True' VerticalAlignment='Bottom'><Line X1='0' Y1='1' X2='420' Y2='1' Stroke='$dot' StrokeThickness='2' StrokeDashArray='0.1 2' StrokeDashCap='Round'/></Grid>" }
  @"
<Grid>
  <Grid Margin='2,6,6,6'>
    <Grid.ColumnDefinitions><ColumnDefinition Width='44'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto' MinWidth='52'/></Grid.ColumnDefinitions>
    <Border x:Name='c$i' Tag='$i' Width='44' Height='44' Background='Transparent' Cursor='Hand' ToolTip='押すと完了(もう一度で元に戻す)' VerticalAlignment='Center'>
      <Grid Width='24' Height='24'>
        <Ellipse x:Name='cr$i' Stroke='$ring' StrokeThickness='2' Fill='White'/>
        <Path x:Name='ck$i' Data='M6.5,12.5 L10.5,16.5 L17.5,8.5' Stroke='White' StrokeThickness='2.6' StrokeStartLineCap='Round' StrokeEndLineCap='Round' StrokeLineJoin='Round' Visibility='Hidden'/>
      </Grid>
    </Border>
    <StackPanel x:Name='tx$i' Grid.Column='1' VerticalAlignment='Center' Margin='4,0,0,0'>
      <StackPanel Orientation='Horizontal'>
        <TextBox x:Name='t$i' Style='{StaticResource Ro}' FontSize='14.5' FontWeight='ExtraBold' Foreground='$ink' MaxWidth='236'/>
        $memo
      </StackPanel>
      <TextBox x:Name='d$i' Style='{StaticResource Ro}' FontSize='12' FontWeight='$dueW' Foreground='$dueC'/>
    </StackPanel>
    <Grid Grid.Column='2' VerticalAlignment='Center'>
      $seal
      <Grid x:Name='s$i' Width='46' Height='46' HorizontalAlignment='Center' Visibility='Collapsed' IsHitTestVisible='False' RenderTransformOrigin='0.5,0.5'>
        <Grid.RenderTransform><TransformGroup><ScaleTransform/><RotateTransform Angle='-14'/></TransformGroup></Grid.RenderTransform>
        <Ellipse Stroke='$stampC' StrokeThickness='2.5'/>
        <Ellipse Margin='3.5' Stroke='$stampC' StrokeThickness='1' Opacity='0.7'/>
        <TextBlock Text='済' FontFamily='Yu Mincho, MS Mincho' FontSize='19' FontWeight='Bold' Foreground='$stampC' HorizontalAlignment='Center' VerticalAlignment='Center'/>
      </Grid>
    </Grid>
  </Grid>
  $sep
</Grid>
"@
}

# しゃべる吹き出しの中身 / 一覧の吹き出し
$sayInner = ''
$list = ''
if ($v.kind -eq 'error') {
  $sayInner = @"
<TextBox x:Name='say1' Style='{StaticResource Ro}' FontSize='15' FontWeight='ExtraBold' Foreground='$ink'/>
<TextBox x:Name='path' Style='{StaticResource Ro}' FontSize='12.5' FontWeight='Bold' Foreground='$purple' Margin='0,6,0,0'/>
<TextBox x:Name='say2' Style='{StaticResource Ro}' FontSize='12' FontWeight='Medium' Foreground='$mute' Margin='0,6,0,0'/>
"@
} elseif ($v.total -eq 0) {
  $sayInner = "<TextBox x:Name='say1' Style='{StaticResource Ro}' FontSize='15' FontWeight='ExtraBold' Foreground='$ink'/>"
} else {
  $sayInner = @"
<TextBox x:Name='say1' Style='{StaticResource Ro}' FontSize='15' FontWeight='ExtraBold' Foreground='$ink'/>
<TextBox x:Name='say2' Style='{StaticResource Ro}' FontSize='15' FontWeight='ExtraBold' Foreground='$ink'/>
<TextBox x:Name='say3' Style='{StaticResource Ro}' FontSize='13' FontWeight='ExtraBold' Foreground='$red' Margin='0,2,0,0'/>
<TextBox x:Name='sayErr' Style='{StaticResource Ro}' FontSize='13' FontWeight='ExtraBold' Foreground='$red' Margin='0,2,0,0' Visibility='Collapsed'/>
"@
  $rows = ''
  $n = $v.items.Count
  for ($i = 0; $i -lt $n; $i++) { $rows += (Row $i $v.items[$i] (($i -eq $n - 1) -and ($v.more -le 0))) }
  $more = ''
  if ($v.more -gt 0) { $more = "<TextBox x:Name='more' Style='{StaticResource Ro}' FontSize='13' FontWeight='ExtraBold' Foreground='$mute' Margin='12,12,10,12' HorizontalAlignment='Left'/>" }
  $list = @"
<Border Margin='0,12,0,0' CornerRadius='26,26,26,8' Background='White' Padding='8,4,8,4'>
  <Border.Effect><DropShadowEffect BlurRadius='36' ShadowDepth='14' Direction='270' Opacity='0.32' Color='#281E64'/></Border.Effect>
  <ScrollViewer x:Name='sv' VerticalScrollBarVisibility='Auto' HorizontalScrollBarVisibility='Disabled'>
    <StackPanel>$rows$more</StackPanel>
  </ScrollViewer>
</Border>
"@
}

$primary = ''
if ($v.kind -eq 'list') { $primary = "<Button x:Name='open' Style='{StaticResource Primary}' Content='アプリを開く' Margin='10,0,0,0'/>" }

$xaml = @"
<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'
        xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'
        Title='いつかやること' Width='478' SizeToContent='Height' WindowStyle='None' AllowsTransparency='True'
        Background='Transparent' ShowInTaskbar='False' Topmost='True' ResizeMode='NoResize'
        FontFamily='M PLUS Rounded 1c, Meiryo UI, Yu Gothic UI, Segoe UI' UseLayoutRounding='True' TextOptions.TextFormattingMode='Display'>
  <Window.Resources>
    <Style x:Key='Ro' TargetType='TextBox'>
      <Setter Property='IsReadOnly' Value='True'/><Setter Property='BorderThickness' Value='0'/>
      <Setter Property='Background' Value='Transparent'/><Setter Property='Padding' Value='0'/>
      <Setter Property='TextWrapping' Value='Wrap'/><Setter Property='Cursor' Value='IBeam'/>
      <Setter Property='IsTabStop' Value='False'/>
    </Style>
    <Style x:Key='Primary' TargetType='Button'>
      <Setter Property='Foreground' Value='White'/><Setter Property='FontSize' Value='14'/><Setter Property='FontWeight' Value='ExtraBold'/>
      <Setter Property='Cursor' Value='Hand'/><Setter Property='Height' Value='48'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='24' Padding='28,0'>
          <Border.Background><LinearGradientBrush StartPoint='0,0' EndPoint='1,0.3'><GradientStop Color='#8A6FE0' Offset='0'/><GradientStop Color='#E57CB8' Offset='1'/></LinearGradientBrush></Border.Background>
          <Border.Effect><DropShadowEffect BlurRadius='16' ShadowDepth='6' Direction='270' Opacity='0.5' Color='#8A6FE0'/></Border.Effect>
          <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Opacity' Value='0.9'/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
    <Style x:Key='Ghost' TargetType='Button'>
      <Setter Property='Foreground' Value='$ink'/><Setter Property='FontSize' Value='14'/><Setter Property='FontWeight' Value='ExtraBold'/>
      <Setter Property='Cursor' Value='Hand'/><Setter Property='Height' Value='48'/><Setter Property='MinWidth' Value='96'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='24' Padding='22,0' Background='#F2FFFFFF' BorderBrush='#D9CFF3' BorderThickness='1.5'>
          <Border.Effect><DropShadowEffect BlurRadius='16' ShadowDepth='5' Direction='270' Opacity='0.28' Color='#281E64'/></Border.Effect>
          <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Background' Value='#FFFFFFFF'/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
    <Style x:Key='XBtn' TargetType='Button'>
      <Setter Property='Foreground' Value='$mute'/><Setter Property='Cursor' Value='Hand'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' Width='34' Height='34' CornerRadius='17' Background='#F2FFFFFF' BorderBrush='#D9CFF3' BorderThickness='1.5'>
          <Border.Effect><DropShadowEffect BlurRadius='12' ShadowDepth='4' Direction='270' Opacity='0.28' Color='#281E64'/></Border.Effect>
          <TextBlock Text='&#x2715;' FontFamily='Segoe UI Symbol' FontSize='13' FontWeight='Bold' HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Background' Value='#FFFFFFFF'/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Grid Margin='24'>
    <StackPanel x:Name='root' Width='430' HorizontalAlignment='Center'>
      <Grid>
        <Grid.ColumnDefinitions><ColumnDefinition Width='Auto'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto'/></Grid.ColumnDefinitions>
        <Border x:Name='av' Width='72' Height='72' CornerRadius='36' BorderBrush='White' BorderThickness='4' Background='White' VerticalAlignment='Bottom'>
          <Border.Effect><DropShadowEffect BlurRadius='20' ShadowDepth='8' Direction='270' Opacity='0.5' Color='#281E64'/></Border.Effect>
        </Border>
        <Border Grid.Column='1' Margin='12,0,8,0' CornerRadius='22,22,22,6' Background='White' Padding='16,12,16,12' VerticalAlignment='Bottom' HorizontalAlignment='Left'>
          <Border.Effect><DropShadowEffect BlurRadius='24' ShadowDepth='10' Direction='270' Opacity='0.3' Color='#281E64'/></Border.Effect>
          <StackPanel>
            <TextBox x:Name='date' Style='{StaticResource Ro}' FontSize='11' FontWeight='ExtraBold' Foreground='$purple'/>
            $sayInner
          </StackPanel>
        </Border>
        <Button x:Name='x' Grid.Column='2' Style='{StaticResource XBtn}' VerticalAlignment='Top' ToolTip='閉じる (Esc)'/>
      </Grid>
      $list
      <StackPanel Orientation='Horizontal' HorizontalAlignment='Right' Margin='0,16,4,4'>
        <Button x:Name='close' Style='{StaticResource Ghost}' Content='閉じる'/>
        $primary
      </StackPanel>
    </StackPanel>
  </Grid>
</Window>
"@

$w = [Windows.Markup.XamlReader]::Parse($xaml)
$wa = [System.Windows.SystemParameters]::WorkArea

if ($Icon -and (Test-Path $Icon)) {
  $bi = New-Object Windows.Media.Imaging.BitmapImage
  $bi.BeginInit(); $bi.UriSource = New-Object Uri($Icon); $bi.CacheOption = 'OnLoad'; $bi.EndInit()
  $br = New-Object Windows.Media.ImageBrush($bi); $br.Stretch = 'UniformToFill'
  $w.FindName('av').Background = $br
}

# ---------- チェック(完了)の状態 ----------
$script:rows = @()
$script:total = [int]$v.total
$script:overdueTotal = [int]$v.overdue

function Update-Say {
  $doneN = @($script:rows | Where-Object { $_.done }).Count
  $overDone = @($script:rows | Where-Object { $_.done -and $_.over }).Count
  $left = $script:total - $doneN
  $overLeft = $script:overdueTotal - $overDone
  $s1 = $w.FindName('say1'); $s2 = $w.FindName('say2'); $s3 = $w.FindName('say3')
  if ($left -le 0) {
    $s1.Text = 'ぜんぶ終わったね！'; $s2.Visibility = 'Collapsed'; $s3.Visibility = 'Collapsed'
  } else {
    $s1.Text = "$($v.greeting)いつかやること、"
    $s2.Visibility = 'Visible'; $s2.Text = "のこり $($left)件だよ"
    if ($overLeft -gt 0) { $s3.Visibility = 'Visible'; $s3.Text = "期限切れが $($overLeft)件あるよ" } else { $s3.Visibility = 'Collapsed' }
  }
}

function Set-RowLook($i, [bool]$done, [bool]$animate) {
  $r = $script:rows[$i]
  $ring = $w.FindName("cr$i"); $ck = $w.FindName("ck$i"); $st = $w.FindName("s$i"); $tx = $w.FindName("tx$i"); $g = $w.FindName("g$i")
  if ($done) {
    $gb = New-Object Windows.Media.LinearGradientBrush([Windows.Media.ColorConverter]::ConvertFromString('#8A6FE0'), [Windows.Media.ColorConverter]::ConvertFromString('#E57CB8'), 30)
    $ring.Fill = $gb; $ring.StrokeThickness = 0; $ck.Visibility = 'Visible'
    $tx.Opacity = 0.45
    $w.FindName("t$i").TextDecorations = [Windows.TextDecorations]::Strikethrough
    if ($g) { $g.Opacity = 0.18 }
    $st.Visibility = 'Visible'
    if ($animate) {
      $sc = $st.RenderTransform.Children[0]; $ro = $st.RenderTransform.Children[1]
      $k = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames
      $k.KeyFrames.Add((New-Object Windows.Media.Animation.LinearDoubleKeyFrame(2.2, [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::Zero)))) | Out-Null
      $k.KeyFrames.Add((New-Object Windows.Media.Animation.EasingDoubleKeyFrame(0.9, [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(270))))) | Out-Null
      $k.KeyFrames.Add((New-Object Windows.Media.Animation.EasingDoubleKeyFrame(1.0, [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(500))))) | Out-Null
      $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $k)
      $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $k)
      $ra = New-Object Windows.Media.Animation.DoubleAnimation(-30, -14, [TimeSpan]::FromMilliseconds(500))
      $ro.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $ra)
      $oa = New-Object Windows.Media.Animation.DoubleAnimation(0, 0.9, [TimeSpan]::FromMilliseconds(270))
      $st.BeginAnimation([Windows.UIElement]::OpacityProperty, $oa)
    } else { $st.Opacity = 0.9 }
  } else {
    $ring.Fill = [Windows.Media.Brushes]::White; $ring.StrokeThickness = 2; $ck.Visibility = 'Hidden'
    $tx.Opacity = 1
    $w.FindName("t$i").TextDecorations = $null
    if ($g) { $g.Opacity = 1 }
    $st.BeginAnimation([Windows.UIElement]::OpacityProperty, $null)
    $st.Visibility = 'Collapsed'
  }
}

function Toggle-Row([int]$i) {
  $r = $script:rows[$i]
  if ($r.pending) { return }
  $r.done = -not $r.done
  $r.pending = $true
  Set-RowLook $i $r.done $true
  Update-Say
  $w.FindName('sayErr').Visibility = 'Collapsed'
  $cmd = if ($r.done) { 'DONE' } else { 'UNDONE' }
  [Console]::Out.WriteLine("$cmd $($r.id)"); [Console]::Out.Flush()
}

function On-Reply([string]$line) {
  if ($line -notmatch '^(OK|ERR) (\S+)') { return }
  $ok = $Matches[1] -eq 'OK'; $id = $Matches[2]
  for ($i = 0; $i -lt $script:rows.Count; $i++) {
    $r = $script:rows[$i]
    if ($r.id -ne $id -or -not $r.pending) { continue }
    $r.pending = $false
    if (-not $ok) {
      # 保存できなかったら元に戻す
      $r.done = -not $r.done
      Set-RowLook $i $r.done $false
      Update-Say
      $e = $w.FindName('sayErr'); $e.Text = '保存できなかったよ…もう一度ためしてね'; $e.Visibility = 'Visible'
    }
  }
}

if ($v.kind -eq 'error') {
  $w.FindName('date').Text = 'いつかやること'
  $w.FindName('say1').Text = $v.say
  if ($v.path) { $w.FindName('path').Text = $v.path } else { $w.FindName('path').Visibility = 'Collapsed' }
  $w.FindName('say2').Text = $v.detail
} else {
  $w.FindName('date').Text = "$($v.dateLabel) · $($v.timeLabel)"
  if ($v.total -eq 0) {
    $w.FindName('say1').Text = 'ぜんぶ終わってるよ！'
  } else {
    $onCheck = { param($s, $e) $e.Handled = $true; Toggle-Row ([int]$s.Tag) }
    for ($i = 0; $i -lt $v.items.Count; $i++) {
      $it = $v.items[$i]
      $script:rows += @{ id = [string]$it.id; done = $false; pending = $false; over = ($it.dueCls -eq 'over') }
      $w.FindName("t$i").Text = $it.title
      $w.FindName("d$i").Text = $it.due
      $l = $w.FindName("l$i"); if ($l) { $l.Text = $it.label }
      $w.FindName("c$i").Add_PreviewMouseLeftButtonDown($onCheck)
    }
    if ($v.more -gt 0) { $w.FindName('more').Text = "ほか $($v.more)件" }
    $w.FindName('sv').MaxHeight = [Math]::Max(180, $wa.Height - 48 - 330)
    Update-Say
  }
}

# node からの返事(標準入力)を、UI スレッドで少しずつ読む
if ([Console]::IsInputRedirected -and $script:rows.Count -gt 0) {
  $script:inReader = New-Object IO.StreamReader([Console]::OpenStandardInput())
  $script:readTask = $script:inReader.ReadLineAsync()
  $script:inTimer = New-Object Windows.Threading.DispatcherTimer
  $script:inTimer.Interval = [TimeSpan]::FromMilliseconds(80)
  $script:inTimer.Add_Tick({
    while ($script:readTask -and $script:readTask.IsCompleted) {
      $line = $script:readTask.Result
      if ($null -eq $line) { $script:readTask = $null; $script:inTimer.Stop(); break }
      On-Reply $line
      $script:readTask = $script:inReader.ReadLineAsync()
    }
  })
  $script:inTimer.Start()
}

$w.MaxHeight = $wa.Height
$w.Opacity = 0
$w.Add_PreviewKeyDown({ param($s, $e) if ($e.Key -eq 'Escape') { $s.Close() } })
$w.Add_MouseLeftButtonDown({ param($s, $e) if ($e.OriginalSource -isnot [System.Windows.Controls.TextBox]) { try { $s.DragMove() } catch {} } })
$w.FindName('x').Add_Click({ $w.Close() })
$w.FindName('close').Add_Click({ $w.Close() })
$openBtn = $w.FindName('open')
if ($openBtn) { $openBtn.Add_Click({ Start-Process $v.appUrl; $w.Close() }) }

$w.Add_Loaded({
  # 作業領域(メインモニター)の中央。ふわっとフェード+せり上がり
  $w.Left = $wa.Left + ($wa.Width - $w.ActualWidth) / 2
  $w.Top = $wa.Top + [Math]::Max(0, ($wa.Height - $w.ActualHeight) / 2)
  $a = New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(320))
  $w.BeginAnimation([Windows.Window]::OpacityProperty, $a)
  $tt = New-Object Windows.Media.TranslateTransform(0, 16)
  $w.FindName('root').RenderTransform = $tt
  $ra = New-Object Windows.Media.Animation.DoubleAnimation(16, 0, [TimeSpan]::FromMilliseconds(380))
  $ra.EasingFunction = New-Object Windows.Media.Animation.CubicEase
  $tt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $ra)
  # タスクスケジューラ(wscript の非表示起動)経由だと、起動時の「隠す」指定が最初の表示に引き継がれて
  # ウィンドウが見えないことがある。見えていなければ明示的に表示する
  $h = (New-Object Windows.Interop.WindowInteropHelper($w)).Handle
  if (-not [SomedayNotify.Win]::IsWindowVisible($h)) { [Console]::Error.WriteLine('[show] window was hidden at load; ShowWindow(SW_SHOW)'); [SomedayNotify.Win]::ShowWindow($h, 5) | Out-Null }
  [SomedayNotify.Win]::SetForegroundWindow($h) | Out-Null
  $w.Activate() | Out-Null
  # 最前面は数秒だけ
  $script:t = New-Object Windows.Threading.DispatcherTimer
  $script:t.Interval = [TimeSpan]::FromSeconds(5)
  $script:t.Add_Tick({ $script:t.Stop(); $w.Topmost = $false })
  $script:t.Start()
  $delay = 1000
  if ($AutoSeq -and $script:rows.Count -gt 0) {
    $script:seq = [System.Collections.Queue]::new()
    foreach ($s in ($AutoSeq -split ',')) { $script:seq.Enqueue([int]$s) }
    $delay += 900 * ($script:seq.Count + 1)
    $script:at = New-Object Windows.Threading.DispatcherTimer
    $script:at.Interval = [TimeSpan]::FromMilliseconds(900)
    $script:at.Add_Tick({ if ($script:seq.Count -eq 0) { $script:at.Stop(); return }; Toggle-Row $script:seq.Dequeue() })
    $script:at.Start()
  }
  if ($Shot) {
    $script:st = New-Object Windows.Threading.DispatcherTimer
    $script:st.Interval = [TimeSpan]::FromMilliseconds($delay)
    $script:st.Add_Tick({
      $script:st.Stop()
      $src = [Windows.PresentationSource]::FromVisual($w)
      $m = $src.CompositionTarget.TransformToDevice
      $x = [int]($w.Left * $m.M11); $y = [int]($w.Top * $m.M22)
      $pw = [int]($w.ActualWidth * $m.M11); $ph = [int]($w.ActualHeight * $m.M22)
      $bmp = New-Object Drawing.Bitmap($pw, $ph)
      $g = [Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($x, $y, 0, 0, (New-Object Drawing.Size($pw, $ph)))
      $bmp.Save($Shot, [Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
      $w.Close()
    })
    $script:st.Start()
  }
})
$w.ShowDialog() | Out-Null
