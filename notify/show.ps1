# いつかやること: 通知ウィンドウ(WPF / PowerShell 5.1)。index.mjs から呼ばれる。見た目は mock-dialog.html に合わせる。
# -Json: 表示内容(index.mjs が作る)  -Icon: ペンギンのアイコン PNG  -Shot: 見た目確認用(画面を PNG 保存して閉じる)
param([Parameter(Mandatory)][string]$Json, [string]$Icon, [string]$Shot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

$v = [IO.File]::ReadAllText($Json, [Text.Encoding]::UTF8) | ConvertFrom-Json

$ink = '#1F2D4A'; $muted = '#5B6D8A'; $blue = '#3F7FD6'; $red = '#D43D55'; $line = '#D5E6F5'

function Pill($name, $bg, $fg) {
  "<Border x:Name='$name' Background='$bg' CornerRadius='11' Padding='10,3' Margin='0,0,8,0'><TextBlock x:Name='${name}T' FontSize='12' FontWeight='Bold' Foreground='$fg'/></Border>"
}

function Row($i, $it) {
  switch ($it.dueCls) {
    'over' { $dot = $red;      $dueC = $red;   $dueW = 'Bold' }
    'soon' { $dot = $blue;     $dueC = $blue;  $dueW = 'Bold' }
    default { $dot = '#B9CBE3'; $dueC = $muted; $dueW = 'Normal' }
  }
  $topLine = if ($i -gt 0) { $line } else { 'Transparent' }
  $seal = ''
  if ($it.labelKey) {
    $c = if ($it.labelKey -eq 'work') { '#3F7FD6' } else { '#E4697A' }
    # はんこ風: 外枠+内側の細い枠(二重線)、-6度の傾き
    $seal = @"
<Grid Grid.Column='2' Margin='6,0,2,0' VerticalAlignment='Center' RenderTransformOrigin='0.5,0.5'>
  <Grid.RenderTransform><RotateTransform Angle='-6'/></Grid.RenderTransform>
  <Border BorderBrush='$c' BorderThickness='1.5' CornerRadius='7' Padding='8,3'><TextBlock x:Name='l$i' FontSize='10.5' FontWeight='Bold' Foreground='$c'/></Border>
  <Border BorderBrush='$c' BorderThickness='1' CornerRadius='5' Margin='2' Opacity='0.5' IsHitTestVisible='False'/>
</Grid>
"@
  }
  $memo = ''
  if ($it.hasNote) { $memo = "<Path Margin='6,2,0,0' Width='11' Height='11' Stretch='Uniform' Stroke='$ink' StrokeThickness='1.6' Opacity='0.55' VerticalAlignment='Center' ToolTip='メモあり' Data='M4,3 H12 A1.5,1.5 0 0 1 13.5,4.5 V11.5 A1.5,1.5 0 0 1 12,13 H4 A1.5,1.5 0 0 1 2.5,11.5 V4.5 A1.5,1.5 0 0 1 4,3 Z M5.5,6.5 H10.5 M5.5,9.5 H10.5'/>" }
  @"
<Border BorderBrush='$topLine' BorderThickness='0,1,0,0' Padding='8,11,8,11'>
  <Grid>
    <Grid.ColumnDefinitions><ColumnDefinition Width='Auto'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto'/></Grid.ColumnDefinitions>
    <Ellipse Width='10' Height='10' Fill='$dot' VerticalAlignment='Top' Margin='0,6,10,0'/>
    <StackPanel Grid.Column='1'>
      <StackPanel Orientation='Horizontal'>
        <TextBox x:Name='t$i' Style='{StaticResource Ro}' FontSize='14.5' FontWeight='Medium' Foreground='$ink'/>
        $memo
      </StackPanel>
      <TextBox x:Name='d$i' Style='{StaticResource Ro}' FontSize='12' FontWeight='$dueW' Foreground='$dueC' Margin='0,1,0,0'/>
    </StackPanel>
    $seal
  </Grid>
</Border>
"@
}

$sum = ''
$body = ''
if ($v.kind -eq 'error') {
  $body = @"
<Border Margin='20,0,20,0' Padding='16' CornerRadius='12' Background='#FFF6F6' BorderBrush='#F2C4C4' BorderThickness='1'>
  <TextBox x:Name='msg' Style='{StaticResource Ro}' FontSize='13' Foreground='$ink'/>
</Border>
"@
} elseif ($v.total -eq 0) {
  $body = @"
<Border Margin='20,0,20,0' Padding='18,22' CornerRadius='12' Background='#B3FFFFFF'>
  <StackPanel HorizontalAlignment='Center'>
    <TextBlock Text='&#x2713;' FontFamily='Segoe UI Symbol' FontSize='30' FontWeight='Bold' Foreground='$blue' HorizontalAlignment='Center'/>
    <TextBlock Text='ぜんぶ終わっています' FontSize='16' FontWeight='SemiBold' Foreground='$ink' HorizontalAlignment='Center' Margin='0,4,0,0'/>
  </StackPanel>
</Border>
"@
} else {
  $pills = ''
  if ($v.overdue -gt 0) { $pills += Pill 'pr' '#FDE8EC' $red }
  if ($v.soon -gt 0)    { $pills += Pill 'pb' '#E1EDFB' $blue }
  $pills += Pill 'pn' '#E9F3FC' $muted
  $sum = "<WrapPanel Margin='20,0,20,12'>$pills</WrapPanel>"
  $rows = ''
  for ($i = 0; $i -lt $v.items.Count; $i++) { $rows += (Row $i $v.items[$i]) }
  $more = ''
  if ($v.more -gt 0) { $more = "<TextBlock x:Name='more' FontSize='12' Foreground='$muted' Margin='20,8,20,0'/>" }
  $body = @"
<StackPanel>
  <ScrollViewer x:Name='sv' Margin='12,0,12,0' VerticalScrollBarVisibility='Auto' HorizontalScrollBarVisibility='Disabled'>
    <StackPanel>$rows</StackPanel>
  </ScrollViewer>
  $more
</StackPanel>
"@
}

$primary = ''
if ($v.kind -eq 'list') { $primary = "<Button x:Name='open' Grid.Column='0' Style='{StaticResource Primary}' Content='アプリを開く' Margin='0,0,10,0'/>" }

$xaml = @"
<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'
        xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'
        Title='いつかやること' Width='468' SizeToContent='Height' WindowStyle='None' AllowsTransparency='True'
        Background='Transparent' ShowInTaskbar='False' Topmost='True' ResizeMode='NoResize'
        FontFamily='Manrope, Yu Gothic UI, Meiryo UI, Segoe UI' UseLayoutRounding='True' TextOptions.TextFormattingMode='Display'>
  <Window.Resources>
    <Style x:Key='Ro' TargetType='TextBox'>
      <Setter Property='IsReadOnly' Value='True'/><Setter Property='BorderThickness' Value='0'/>
      <Setter Property='Background' Value='Transparent'/><Setter Property='Padding' Value='0'/>
      <Setter Property='TextWrapping' Value='Wrap'/><Setter Property='Cursor' Value='IBeam'/>
      <Setter Property='IsTabStop' Value='False'/>
    </Style>
    <Style x:Key='Primary' TargetType='Button'>
      <Setter Property='Foreground' Value='White'/><Setter Property='FontSize' Value='14'/><Setter Property='FontWeight' Value='Bold'/>
      <Setter Property='Cursor' Value='Hand'/><Setter Property='Height' Value='44'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='22'>
          <Border.Background><LinearGradientBrush StartPoint='0,0' EndPoint='1,0.4'><GradientStop Color='#3F7FD6' Offset='0'/><GradientStop Color='#5FBCF0' Offset='1'/></LinearGradientBrush></Border.Background>
          <Border.Effect><DropShadowEffect BlurRadius='14' ShadowDepth='5' Direction='270' Opacity='0.35' Color='#3F7FD6'/></Border.Effect>
          <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Opacity' Value='0.9'/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
    <Style x:Key='Ghost' TargetType='Button'>
      <Setter Property='Foreground' Value='$ink'/><Setter Property='FontSize' Value='14'/><Setter Property='FontWeight' Value='Bold'/>
      <Setter Property='Cursor' Value='Hand'/><Setter Property='Height' Value='44'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='22' Padding='20,0' Background='#FFFFFF' BorderBrush='$line' BorderThickness='1'>
          <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Background' Value='#E9F3FC'/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
    <Style x:Key='XBtn' TargetType='Button'>
      <Setter Property='Foreground' Value='$muted'/><Setter Property='Cursor' Value='Hand'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='18' Background='Transparent'>
          <TextBlock Text='&#x2715;' FontSize='15' HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Background' Value='#E9F3FC'/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Grid Margin='24'>
    <Border x:Name='card' CornerRadius='22' BorderThickness='1' BorderBrush='#CCFFFFFF' ClipToBounds='True'>
      <Border.Effect><DropShadowEffect BlurRadius='60' ShadowDepth='24' Direction='270' Opacity='0.30' Color='#142A5A'/></Border.Effect>
      <Border.Background>
        <LinearGradientBrush StartPoint='0,0' EndPoint='0,1'><GradientStop Color='#FAFFFFFF' Offset='0'/><GradientStop Color='#FAF2F8FE' Offset='1'/></LinearGradientBrush>
      </Border.Background>
      <Grid>
        <Ellipse Width='300' Height='170' HorizontalAlignment='Right' VerticalAlignment='Top' Margin='0,-60,-90,0' IsHitTestVisible='False'>
          <Ellipse.Fill><RadialGradientBrush><GradientStop Color='#595FBCF0' Offset='0'/><GradientStop Color='#005FBCF0' Offset='1'/></RadialGradientBrush></Ellipse.Fill>
        </Ellipse>
        <StackPanel>
          <Grid Margin='20,18,14,14'>
            <Grid.ColumnDefinitions><ColumnDefinition Width='Auto'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto'/></Grid.ColumnDefinitions>
            <Border Width='48' Height='48' CornerRadius='13' ClipToBounds='True'>
              <Border.Effect><DropShadowEffect BlurRadius='12' ShadowDepth='5' Direction='270' Opacity='0.35' Color='#28508C'/></Border.Effect>
              <Border.Clip><RectangleGeometry Rect='0,0,48,48' RadiusX='13' RadiusY='13'/></Border.Clip>
              <Image x:Name='icon' Stretch='UniformToFill'/>
            </Border>
            <StackPanel Grid.Column='1' Margin='14,0,0,0' VerticalAlignment='Center'>
              <TextBox x:Name='date' Style='{StaticResource Ro}' FontSize='11.5' FontWeight='Bold' Foreground='$blue'/>
              <TextBox x:Name='head' Style='{StaticResource Ro}' FontSize='20' FontWeight='Bold' Foreground='$ink'/>
            </StackPanel>
            <Button x:Name='x' Grid.Column='2' Style='{StaticResource XBtn}' Width='36' Height='36' VerticalAlignment='Top' ToolTip='閉じる (Esc)'/>
          </Grid>
          $sum
          $body
          <Grid Margin='20,14,20,18'>
            <Grid.ColumnDefinitions><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto'/></Grid.ColumnDefinitions>
            $primary
            <Button x:Name='close' Grid.Column='1' Style='{StaticResource Ghost}' Content='閉じる'/>
          </Grid>
        </StackPanel>
      </Grid>
    </Border>
  </Grid>
</Window>
"@

$w = [Windows.Markup.XamlReader]::Parse($xaml)
$wa = [System.Windows.SystemParameters]::WorkArea

# 文字をセット(名前つきの要素へ。XML エスケープ不要)
if ($Icon -and (Test-Path $Icon)) {
  $bi = New-Object Windows.Media.Imaging.BitmapImage
  $bi.BeginInit(); $bi.UriSource = New-Object Uri($Icon); $bi.CacheOption = 'OnLoad'; $bi.EndInit()
  $w.FindName('icon').Source = $bi
}
if ($v.kind -eq 'error') {
  $w.FindName('date').Text = 'いつかやること'
  $w.FindName('head').Text = $v.heading
  $w.FindName('msg').Text = $v.message
} else {
  $w.FindName('date').Text = "$($v.dateLabel) · $($v.timeLabel)"
  $w.FindName('head').Text = $v.heading
  if ($v.total -gt 0) {
    for ($i = 0; $i -lt $v.items.Count; $i++) {
      $it = $v.items[$i]
      $w.FindName("t$i").Text = $it.title
      $w.FindName("d$i").Text = $it.due
      $l = $w.FindName("l$i"); if ($l) { $l.Text = $it.label }
    }
    $p = $w.FindName('prT'); if ($p) { $p.Text = "期限切れ $($v.overdue)" }
    $p = $w.FindName('pbT'); if ($p) { $p.Text = "もうすぐ $($v.soon)" }
    $w.FindName('pnT').Text = "未完了 $($v.total)"
    if ($v.more -gt 0) { $w.FindName('more').Text = "ほか $($v.more)件" }
    $w.FindName('sv').MaxHeight = [Math]::Max(160, $wa.Height - 48 - 260)
  }
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
  # 作業領域(メインモニター)の中央に置く。ふわっとフェード+せり上がり
  $w.Left = $wa.Left + ($wa.Width - $w.ActualWidth) / 2
  $w.Top = $wa.Top + [Math]::Max(0, ($wa.Height - $w.ActualHeight) / 2)
  $a = New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(320))
  $w.BeginAnimation([Windows.Window]::OpacityProperty, $a)
  $tt = New-Object Windows.Media.TranslateTransform(0, 16)
  $w.FindName('card').RenderTransform = $tt
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
    $script:st.Interval = [TimeSpan]::FromMilliseconds(900)
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
