# いつかやること: 通知ウィンドウ「ふきだし」(WPF / PowerShell 5.1)。index.mjs から呼ばれる。見た目は mock-dialog-cute.html の .v2。
# -Json: 表示内容(index.mjs が作る)  -Icon: ペンギンのアイコン PNG  -Shot: 見た目確認用(画面を PNG 保存して閉じる)
param([Parameter(Mandatory)][string]$Json, [string]$Icon, [string]$Shot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

$v = [IO.File]::ReadAllText($Json, [Text.Encoding]::UTF8) | ConvertFrom-Json

$ink = '#2E2A4A'; $purple = '#8A6FE0'; $pink = '#E5559C'; $red = '#DD4670'; $mute = '#7A6F9A'; $dot = '#E6DEF8'

function Row($i, $it, $last) {
  $over = ($it.dueCls -eq 'over')
  if ($over) { $icoBg = '#FFE1E8'; $icoFg = $red; $ico = '!'; $dueC = $red; $dueW = 'ExtraBold' }
  else {
    $icoBg = '#EFE8FC'; $icoFg = $purple; $ico = [string]($i + 1)
    if ($it.dueCls -eq 'soon') { $dueC = $purple; $dueW = 'ExtraBold' } else { $dueC = $mute; $dueW = 'Medium' }
  }
  $seal = ''
  if ($it.labelKey) {
    $c = if ($it.labelKey -eq 'work') { $purple } else { $pink }
    $seal = @"
<Grid Grid.Column='2' Margin='6,0,2,0' VerticalAlignment='Center' RenderTransformOrigin='0.5,0.5'>
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
  <Grid Margin='10,12,10,12'>
    <Grid.ColumnDefinitions><ColumnDefinition Width='Auto'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto'/></Grid.ColumnDefinitions>
    <Border Width='30' Height='30' CornerRadius='15' Background='$icoBg' VerticalAlignment='Center' Margin='0,0,10,0'>
      <TextBlock Text='$ico' FontSize='14' FontWeight='ExtraBold' Foreground='$icoFg' HorizontalAlignment='Center' VerticalAlignment='Center'/>
    </Border>
    <StackPanel Grid.Column='1' VerticalAlignment='Center'>
      <StackPanel Orientation='Horizontal'>
        <TextBox x:Name='t$i' Style='{StaticResource Ro}' FontSize='14.5' FontWeight='ExtraBold' Foreground='$ink' MaxWidth='250'/>
        $memo
      </StackPanel>
      <TextBox x:Name='d$i' Style='{StaticResource Ro}' FontSize='12' FontWeight='$dueW' Foreground='$dueC'/>
    </StackPanel>
    $seal
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
"@
  $rows = ''
  $n = $v.items.Count
  for ($i = 0; $i -lt $n; $i++) { $rows += (Row $i $v.items[$i] (($i -eq $n - 1) -and ($v.more -le 0))) }
  $more = ''
  if ($v.more -gt 0) { $more = "<TextBox x:Name='more' Style='{StaticResource Ro}' FontSize='13' FontWeight='ExtraBold' Foreground='$mute' Margin='10,12,10,12' HorizontalAlignment='Left'/>" }
  $list = @"
<Border Margin='0,12,0,0' CornerRadius='26,26,26,8' Background='White' Padding='10,6,10,6'>
  <Border.Effect><DropShadowEffect BlurRadius='36' ShadowDepth='14' Direction='270' Opacity='0.32' Color='#281E64'/></Border.Effect>
  <StackPanel>$rows$more</StackPanel>
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
      <Setter Property='Cursor' Value='Hand'/><Setter Property='Height' Value='48'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='24' Padding='20,0' Background='#D9FFFFFF'>
          <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Background' Value='#FFFFFFFF'/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Grid Margin='24'>
    <StackPanel x:Name='root' Width='430' HorizontalAlignment='Center'>
      <Grid>
        <Grid.ColumnDefinitions><ColumnDefinition Width='Auto'/><ColumnDefinition Width='*'/></Grid.ColumnDefinitions>
        <Border x:Name='av' Width='72' Height='72' CornerRadius='36' BorderBrush='White' BorderThickness='4' Background='White' VerticalAlignment='Bottom'>
          <Border.Effect><DropShadowEffect BlurRadius='20' ShadowDepth='8' Direction='270' Opacity='0.5' Color='#281E64'/></Border.Effect>
        </Border>
        <Border Grid.Column='1' Margin='12,0,0,0' CornerRadius='22,22,22,6' Background='White' Padding='16,12,16,12' VerticalAlignment='Bottom' HorizontalAlignment='Left'>
          <Border.Effect><DropShadowEffect BlurRadius='24' ShadowDepth='10' Direction='270' Opacity='0.3' Color='#281E64'/></Border.Effect>
          <StackPanel>
            <TextBox x:Name='date' Style='{StaticResource Ro}' FontSize='11' FontWeight='ExtraBold' Foreground='$purple'/>
            $sayInner
          </StackPanel>
        </Border>
      </Grid>
      $list
      <StackPanel Orientation='Horizontal' HorizontalAlignment='Right' Margin='0,14,0,0'>
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
    $w.FindName('say1').Text = "$($v.greeting)いつかやること、"
    $w.FindName('say2').Text = "のこり $($v.total)件だよ"
    $s3 = $w.FindName('say3')
    if ($v.overdue -gt 0) { $s3.Text = "期限切れが $($v.overdue)件あるよ" } else { $s3.Visibility = 'Collapsed' }
    for ($i = 0; $i -lt $v.items.Count; $i++) {
      $it = $v.items[$i]
      $w.FindName("t$i").Text = $it.title
      $w.FindName("d$i").Text = $it.due
      $l = $w.FindName("l$i"); if ($l) { $l.Text = $it.label }
    }
    if ($v.more -gt 0) { $w.FindName('more').Text = "ほか $($v.more)件" }
  }
}

$w.MaxHeight = $wa.Height
$w.Opacity = 0
$w.Add_PreviewKeyDown({ param($s, $e) if ($e.Key -eq 'Escape') { $s.Close() } })
$w.Add_MouseLeftButtonDown({ param($s, $e) if ($e.OriginalSource -isnot [System.Windows.Controls.TextBox]) { try { $s.DragMove() } catch {} } })
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
  $w.Activate() | Out-Null
  # 最前面は数秒だけ
  $script:t = New-Object Windows.Threading.DispatcherTimer
  $script:t.Interval = [TimeSpan]::FromSeconds(5)
  $script:t.Add_Tick({ $script:t.Stop(); $w.Topmost = $false })
  $script:t.Start()
  if ($Shot) {
    $script:st = New-Object Windows.Threading.DispatcherTimer
    $script:st.Interval = [TimeSpan]::FromMilliseconds(1000)
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
