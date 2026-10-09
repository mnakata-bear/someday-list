# いつかやること: 通知ウィンドウ「ふきだし」(WPF / PowerShell 5.1)。index.mjs から呼ばれる。見た目は mock-dialog-cute.html の .v2。
# -Json: 表示内容(index.mjs が作る)  -Icon: ペンギンのアイコン PNG  -Shot: 見た目確認用(画面を PNG 保存して閉じる)
# 確認用(マウスを動かさずに操作する): -AutoSeq "0,1,0" 行のチェックを順に押す / -AutoAdd "タイトル|期限キー|ラベル;..." 追加 / -AutoExpand 「ほか N件」を開く
# node とは1行プロトコルでやりとりする(詳しくは proto.mjs)。
param([Parameter(Mandatory)][string]$Json, [string]$Icon, [string]$Shot, [string]$AutoSeq, [string]$AutoAdd, [switch]$AutoExpand)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms
Add-Type -Namespace SomedayNotify -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
'@

$v = [IO.File]::ReadAllText($Json, [Text.Encoding]::UTF8) | ConvertFrom-Json

$ink = '#2E2A4A'; $purple = '#8A6FE0'; $pink = '#E5559C'; $red = '#DD4670'; $mute = '#7A6F9A'; $dot = '#E6DEF8'; $stampC = '#D9466F'
$ro = "IsReadOnly='True' BorderThickness='0' Background='Transparent' Padding='0' TextWrapping='Wrap' Cursor='IBeam' IsTabStop='False'"
$ns = "xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'"

function Send([string]$line) { [Console]::Out.WriteLine($line); [Console]::Out.Flush() }
function To-B64($obj) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 5))) }
function From-B64([string]$s) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s)) | ConvertFrom-Json }

# ---------- 一覧の1行(XAML の断片から作る。行は後から足せる) ----------
function New-Row($it) {
  $titleMax = [int]$script:titleMax
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
<Grid x:Name='g' Margin='4,0,2,0' VerticalAlignment='Center' HorizontalAlignment='Center' RenderTransformOrigin='0.5,0.5'>
  <Grid.RenderTransform><RotateTransform Angle='-6'/></Grid.RenderTransform>
  <Border BorderBrush='$c' BorderThickness='1.5' CornerRadius='8' Padding='9,3'><TextBlock x:Name='l' FontSize='10.5' FontWeight='ExtraBold' Foreground='$c'/></Border>
  <Rectangle Margin='2.5' RadiusX='5' RadiusY='5' Stroke='$c' StrokeThickness='1' StrokeDashArray='3 2' Opacity='0.55' IsHitTestVisible='False'/>
</Grid>
"@
  }
  $memo = ''
  if ($it.hasNote) { $memo = "<Path Margin='6,3,0,0' Width='11' Height='11' Stretch='Uniform' Stroke='$mute' StrokeThickness='1.6' Opacity='0.7' VerticalAlignment='Center' ToolTip='メモあり' Data='M4,3 H12 A1.5,1.5 0 0 1 13.5,4.5 V11.5 A1.5,1.5 0 0 1 12,13 H4 A1.5,1.5 0 0 1 2.5,11.5 V4.5 A1.5,1.5 0 0 1 4,3 Z M5.5,6.5 H10.5 M5.5,9.5 H10.5'/>" }
  $x = @"
<Grid $ns>
  <Grid x:Name='sep' Height='2' ClipToBounds='True' VerticalAlignment='Top'><Line X1='0' Y1='1' X2='1600' Y2='1' Stroke='$dot' StrokeThickness='2' StrokeDashArray='0.1 2' StrokeDashCap='Round'/></Grid>
  <Grid Margin='2,6,6,6'>
    <Grid.ColumnDefinitions><ColumnDefinition Width='44'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto' MinWidth='52'/></Grid.ColumnDefinitions>
    <Border x:Name='c' Width='44' Height='44' Background='Transparent' Cursor='Hand' ToolTip='押すと完了(もう一度で元に戻す)' VerticalAlignment='Center'>
      <Grid Width='24' Height='24'>
        <Ellipse x:Name='cr' Stroke='$ring' StrokeThickness='2' Fill='White'/>
        <Path x:Name='ck' Data='M6.5,12.5 L10.5,16.5 L17.5,8.5' Stroke='White' StrokeThickness='2.6' StrokeStartLineCap='Round' StrokeEndLineCap='Round' StrokeLineJoin='Round' Visibility='Hidden'/>
      </Grid>
    </Border>
    <StackPanel x:Name='tx' Grid.Column='1' VerticalAlignment='Center' Margin='4,0,0,0'>
      <StackPanel Orientation='Horizontal'>
        <TextBox x:Name='t' $ro FontSize='14.5' FontWeight='ExtraBold' Foreground='$ink' MaxWidth='$titleMax'/>
        $memo
      </StackPanel>
      <TextBox x:Name='d' $ro FontSize='12' FontWeight='$dueW' Foreground='$dueC'/>
    </StackPanel>
    <Grid Grid.Column='2' VerticalAlignment='Center'>
      $seal
      <Grid x:Name='s' Width='46' Height='46' HorizontalAlignment='Center' Visibility='Collapsed' IsHitTestVisible='False' RenderTransformOrigin='0.5,0.5'>
        <Grid.RenderTransform><TransformGroup><ScaleTransform/><RotateTransform Angle='-14'/></TransformGroup></Grid.RenderTransform>
        <Ellipse Stroke='$stampC' StrokeThickness='2.5'/>
        <Ellipse Margin='3.5' Stroke='$stampC' StrokeThickness='1' Opacity='0.7'/>
        <TextBlock Text='済' FontFamily='Yu Mincho, MS Mincho' FontSize='19' FontWeight='Bold' Foreground='$stampC' HorizontalAlignment='Center' VerticalAlignment='Center'/>
      </Grid>
    </Grid>
  </Grid>
</Grid>
"@
  $el = [Windows.Markup.XamlReader]::Parse($x)
  $el.FindName('t').Text = $it.title
  $el.FindName('d').Text = $it.due
  $l = $el.FindName('l'); if ($l) { $l.Text = $it.label }
  $c = $el.FindName('c'); $c.Tag = [string]$it.id
  $c.Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Toggle-Row ([string]$s.Tag) })
  @{ id = [string]$it.id; key = [string]$it.key; over = $over; done = $false; pending = $false; el = $el
     ring = $el.FindName('cr'); ck = $el.FindName('ck'); stamp = $el.FindName('s'); tx = $el.FindName('tx')
     title = $el.FindName('t'); seal = $el.FindName('g'); sep = $el.FindName('sep') }
}

# ---------- 吹き出しの中身 ----------
$sayInner = ''
$listAndAdd = ''
if ($v.kind -eq 'error') {
  $sayInner = @"
<TextBox x:Name='say1' $ro FontSize='15' FontWeight='ExtraBold' Foreground='$ink'/>
<TextBox x:Name='path' $ro FontSize='12.5' FontWeight='Bold' Foreground='$purple' Margin='0,6,0,0'/>
<TextBox x:Name='say2' $ro FontSize='12' FontWeight='Medium' Foreground='$mute' Margin='0,6,0,0'/>
"@
} else {
  $sayInner = @"
<TextBox x:Name='say1' $ro FontSize='15' FontWeight='ExtraBold' Foreground='$ink'/>
<TextBox x:Name='say2' $ro FontSize='15' FontWeight='ExtraBold' Foreground='$ink'/>
<TextBox x:Name='say3' $ro FontSize='13' FontWeight='ExtraBold' Foreground='$red' Margin='0,2,0,0'/>
<TextBox x:Name='sayErr' $ro FontSize='13' FontWeight='ExtraBold' Foreground='$red' Margin='0,2,0,0' Visibility='Collapsed'/>
"@
  # 期限チップ / ラベルのはんこ
  $chips = ''
  for ($i = 0; $i -lt $v.chips.Count; $i++) {
    $chips += "<Border x:Name='chip$i' Tag='$i' CornerRadius='12' Padding='11,4' Margin='0,0,6,6' Cursor='Hand'><TextBlock x:Name='chipT$i' FontSize='12' FontWeight='ExtraBold'/></Border>"
  }
  $labs = ''
  $labDefs = @(@('', 'なし', '#9C93B8'), @('work', '仕事', $purple), @('private', 'プライベート', $pink))
  for ($i = 0; $i -lt 3; $i++) {
    $c = $labDefs[$i][2]
    $labs += @"
<Grid x:Name='lab$i' Tag='$i' Margin='2,0,10,6' Cursor='Hand' Background='Transparent' RenderTransformOrigin='0.5,0.5'>
  <Grid.RenderTransform><RotateTransform Angle='-6'/></Grid.RenderTransform>
  <Border x:Name='labB$i' BorderBrush='$c' BorderThickness='1.5' CornerRadius='8' Padding='9,3'><TextBlock Text='$($labDefs[$i][1])' FontSize='11' FontWeight='ExtraBold' Foreground='$c'/></Border>
  <Rectangle Margin='2.5' RadiusX='5' RadiusY='5' Stroke='$c' StrokeThickness='1' StrokeDashArray='3 2' Opacity='0.55' IsHitTestVisible='False'/>
</Grid>
"@
  }
  $listAndAdd = @"
<Border x:Name='listB' Margin='0,12,0,0' CornerRadius='26,26,26,8' Background='White' Padding='8,4,8,4'>
  <Border.Effect><DropShadowEffect BlurRadius='36' ShadowDepth='14' Direction='270' Opacity='0.32' Color='#281E64'/></Border.Effect>
  <StackPanel>
    <ScrollViewer x:Name='sv' VerticalScrollBarVisibility='Auto' HorizontalScrollBarVisibility='Disabled'>
      <StackPanel x:Name='listP'/>
    </ScrollViewer>
    <Grid>
      <Border x:Name='moreB' Cursor='Hand' Background='#F1ECFC' CornerRadius='14' Padding='14,6' Margin='8,6,8,8' HorizontalAlignment='Left'>
        <TextBlock x:Name='more' FontSize='12.5' FontWeight='ExtraBold' Foreground='$purple'/>
      </Border>
      <Thumb x:Name='grip' Width='22' Height='22' HorizontalAlignment='Right' VerticalAlignment='Bottom' Margin='0,0,-2,0' Cursor='SizeNWSE' ToolTip='ドラッグで大きさを変える'>
        <Thumb.Template><ControlTemplate TargetType='Thumb'>
          <Grid Background='Transparent'>
            <Path Data='M18,6 L6,18 M18,11 L11,18 M18,16 L16,18' Stroke='#B9A6EE' StrokeThickness='1.8' StrokeStartLineCap='Round' StrokeEndLineCap='Round'/>
          </Grid>
        </ControlTemplate></Thumb.Template>
      </Thumb>
    </Grid>
  </StackPanel>
</Border>
<Border x:Name='addB' Margin='0,12,0,0' CornerRadius='22,22,22,8' Background='#F7FFFFFF' Padding='14,12,14,12' Visibility='Collapsed'>
  <Border.Effect><DropShadowEffect BlurRadius='28' ShadowDepth='10' Direction='270' Opacity='0.26' Color='#281E64'/></Border.Effect>
  <StackPanel>
    <Border CornerRadius='14' Background='#F4F0FD' BorderBrush='#E3DAF8' BorderThickness='1'>
      <Grid>
        <TextBox x:Name='inp' BorderThickness='0' Background='Transparent' Padding='12,10' FontSize='14' FontWeight='Bold' Foreground='$ink' MaxLength='300' VerticalContentAlignment='Center'/>
        <TextBlock x:Name='ph' Text='いつかやりたいことを追加…' Margin='14,0,0,0' VerticalAlignment='Center' FontSize='14' Foreground='#A79CC6' IsHitTestVisible='False'/>
      </Grid>
    </Border>
    <WrapPanel Margin='0,10,0,0'>
      <TextBlock Text='期限' FontSize='11.5' FontWeight='ExtraBold' Foreground='$mute' VerticalAlignment='Top' Margin='2,4,8,0'/>
      $chips
    </WrapPanel>
    <WrapPanel Margin='0,2,0,0'>
      <TextBlock Text='ラベル' FontSize='11.5' FontWeight='ExtraBold' Foreground='$mute' VerticalAlignment='Top' Margin='2,4,8,0'/>
      $labs
    </WrapPanel>
    <StackPanel Orientation='Horizontal' HorizontalAlignment='Right' Margin='0,6,0,0'>
      <Button x:Name='cancelBtn' Style='{StaticResource Ghost}' Height='40' MinWidth='80' Content='やめる' ToolTip='やめる (Esc)'/>
      <Button x:Name='addBtn' Style='{StaticResource Primary}' Height='40' Content='追加' Margin='8,0,0,0' ToolTip='追加 (Enter)'/>
    </StackPanel>
  </StackPanel>
</Border>
"@
}

$primary = ''
$plus = ''
if ($v.kind -eq 'list') {
  $primary = "<Button x:Name='open' Style='{StaticResource Primary}' Content='アプリを開く' Margin='10,0,0,0'/>"
  $plus = "<Button x:Name='plusBtn' Style='{StaticResource AddPill}' Content='＋ 追加' HorizontalAlignment='Left' ToolTip='新しく追加する'/>"
}

$xaml = @"
<Window $ns
        Title='いつかやること' Width='478' SizeToContent='Height' WindowStyle='None' AllowsTransparency='True'
        Background='Transparent' ShowInTaskbar='True' Topmost='True' ResizeMode='NoResize'
        FontFamily='M PLUS Rounded 1c, Meiryo UI, Yu Gothic UI, Segoe UI' UseLayoutRounding='True' TextOptions.TextFormattingMode='Display'>
  <Window.Resources>
    <Style TargetType='ScrollBar'>
      <Setter Property='Width' Value='8'/><Setter Property='MinWidth' Value='8'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='ScrollBar'>
        <Track x:Name='PART_Track' IsDirectionReversed='True' Margin='0,10,0,10'>
          <Track.Thumb><Thumb><Thumb.Template><ControlTemplate TargetType='Thumb'><Border CornerRadius='4' Background='#D9CFF3' Margin='1,0'/></ControlTemplate></Thumb.Template></Thumb></Track.Thumb>
        </Track>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
    <Style x:Key='Primary' TargetType='Button'>
      <Setter Property='Foreground' Value='White'/><Setter Property='FontSize' Value='14'/><Setter Property='FontWeight' Value='ExtraBold'/>
      <Setter Property='Cursor' Value='Hand'/><Setter Property='Height' Value='48'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='24' Padding='26,0' MinWidth='64'>
          <Border.Background><LinearGradientBrush StartPoint='0,0' EndPoint='1,0.3'><GradientStop Color='#8A6FE0' Offset='0'/><GradientStop Color='#E57CB8' Offset='1'/></LinearGradientBrush></Border.Background>
          <Border.Effect><DropShadowEffect BlurRadius='16' ShadowDepth='6' Direction='270' Opacity='0.5' Color='#8A6FE0'/></Border.Effect>
          <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers>
          <Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Opacity' Value='0.9'/></Trigger>
          <Trigger Property='IsEnabled' Value='False'><Setter TargetName='b' Property='Opacity' Value='0.55'/></Trigger>
        </ControlTemplate.Triggers>
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
    <Style x:Key='AddPill' TargetType='Button'>
      <Setter Property='Foreground' Value='$purple'/><Setter Property='FontSize' Value='14'/><Setter Property='FontWeight' Value='ExtraBold'/>
      <Setter Property='Cursor' Value='Hand'/><Setter Property='Height' Value='44'/>
      <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
        <Border x:Name='b' CornerRadius='22' Padding='18,0' Background='#F1ECFC' BorderBrush='#CDBEF4' BorderThickness='1.5'>
          <Border.Effect><DropShadowEffect BlurRadius='14' ShadowDepth='4' Direction='270' Opacity='0.22' Color='#281E64'/></Border.Effect>
          <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='b' Property='Background' Value='#E8E0FB'/></Trigger></ControlTemplate.Triggers>
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
  <Window.ContextMenu>
    <ContextMenu>
      <MenuItem x:Name='mCenter' Header='中央に戻す'/>
      <MenuItem x:Name='mSize' Header='元の大きさに戻す'/>
      <MenuItem x:Name='mClose' Header='閉じる'/>
    </ContextMenu>
  </Window.ContextMenu>
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
            <TextBox x:Name='date' $ro FontSize='11' FontWeight='ExtraBold' Foreground='$purple'/>
            $sayInner
          </StackPanel>
        </Border>
        <Button x:Name='x' Grid.Column='2' Style='{StaticResource XBtn}' VerticalAlignment='Top' ToolTip='閉じる (Esc)・右クリックで「中央に戻す」'/>
      </Grid>
      $listAndAdd
      <Grid Margin='0,16,4,4'>
        $plus
        <StackPanel Orientation='Horizontal' HorizontalAlignment='Right'>
          <Button x:Name='close' Style='{StaticResource Ghost}' Content='閉じる'/>
          $primary
        </StackPanel>
      </Grid>
    </StackPanel>
  </Grid>
</Window>
"@

$w = [Windows.Markup.XamlReader]::Parse($xaml)
# タスクバーにペンギンのアイコンで表示する
$ico = Join-Path $PSScriptRoot 'assets\icon.ico'
if (Test-Path $ico) { try { $w.Icon = [Windows.Media.Imaging.BitmapFrame]::Create((New-Object Uri($ico))) } catch {} }
$wa = [System.Windows.SystemParameters]::WorkArea

if ($Icon -and (Test-Path $Icon)) {
  $bi = New-Object Windows.Media.Imaging.BitmapImage
  $bi.BeginInit(); $bi.UriSource = New-Object Uri($Icon); $bi.CacheOption = 'OnLoad'; $bi.EndInit()
  $br = New-Object Windows.Media.ImageBrush($bi); $br.Stretch = 'UniformToFill'
  $w.FindName('av').Background = $br
}

# ---------- 状態 ----------
$script:rows = New-Object System.Collections.ArrayList
$script:total = [int]$v.total
$script:overdueTotal = [int]$v.overdue
$script:anyChange = $false
$script:addSeq = 0
$script:adds = @{}
$script:dueIdx = 0
$script:limit = [int]$v.limit; if ($script:limit -le 0) { $script:limit = 5 }
$script:expanded = [bool]$v.expanded
$script:hasPos = $false
$script:userW = $null; $script:userH = $null
$script:titleMax = 236
$script:labIdx = 0

function Update-Say {
  $doneN = @($script:rows | Where-Object { $_.done }).Count
  $overDone = @($script:rows | Where-Object { $_.done -and $_.over }).Count
  $left = $script:total - $doneN
  $overLeft = $script:overdueTotal - $overDone
  $s1 = $w.FindName('say1'); $s2 = $w.FindName('say2'); $s3 = $w.FindName('say3')
  if ($left -le 0) {
    $s1.Text = if ($script:anyChange) { 'ぜんぶ終わったね！' } else { 'ぜんぶ終わってるよ！' }
    $s2.Visibility = 'Collapsed'; $s3.Visibility = 'Collapsed'
  } else {
    $s1.Text = "$($v.greeting)いつかやること、"
    $s2.Visibility = 'Visible'; $s2.Text = "のこり $($left)件だよ"
    if ($overLeft -gt 0) { $s3.Visibility = 'Visible'; $s3.Text = "期限切れが $($overLeft)件あるよ" } else { $s3.Visibility = 'Collapsed' }
  }
  $w.FindName('listB').Visibility = if ($script:rows.Count -gt 0) { 'Visible' } else { 'Collapsed' }
}

function Say-Error([string]$msg) {
  $e = $w.FindName('sayErr')
  if ($msg) { $e.Text = $msg; $e.Visibility = 'Visible' } else { $e.Visibility = 'Collapsed' }
}

# 区切りの点線: 見えている行の先頭だけ消す
function Update-Seps {
  $first = $true
  foreach ($r in $script:rows) {
    if ($r.el.Visibility -ne 'Visible') { continue }
    $r.sep.Visibility = if ($first) { 'Collapsed' } else { 'Visible' }
    $first = $false
  }
}

function Find-Row([string]$id) { foreach ($r in $script:rows) { if ($r.id -eq $id) { return $r } }; $null }

function Set-RowLook($r, [bool]$done, [bool]$animate) {
  $st = $r.stamp
  if ($done) {
    $gb = New-Object Windows.Media.LinearGradientBrush([Windows.Media.ColorConverter]::ConvertFromString('#8A6FE0'), [Windows.Media.ColorConverter]::ConvertFromString('#E57CB8'), 30)
    $r.ring.Fill = $gb; $r.ring.StrokeThickness = 0; $r.ck.Visibility = 'Visible'
    $r.tx.Opacity = 0.45
    $r.title.TextDecorations = [Windows.TextDecorations]::Strikethrough
    if ($r.seal) { $r.seal.Opacity = 0.18 }
    $st.Visibility = 'Visible'
    if ($animate) {
      $sc = $st.RenderTransform.Children[0]; $rot = $st.RenderTransform.Children[1]
      $k = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames
      $k.KeyFrames.Add((New-Object Windows.Media.Animation.LinearDoubleKeyFrame(2.2, [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::Zero)))) | Out-Null
      $k.KeyFrames.Add((New-Object Windows.Media.Animation.EasingDoubleKeyFrame(0.9, [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(270))))) | Out-Null
      $k.KeyFrames.Add((New-Object Windows.Media.Animation.EasingDoubleKeyFrame(1.0, [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(500))))) | Out-Null
      $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $k)
      $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $k)
      $ra = New-Object Windows.Media.Animation.DoubleAnimation(-30, -14, [TimeSpan]::FromMilliseconds(500))
      $rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $ra)
      $oa = New-Object Windows.Media.Animation.DoubleAnimation(0, 0.9, [TimeSpan]::FromMilliseconds(270))
      $st.BeginAnimation([Windows.UIElement]::OpacityProperty, $oa)
    } else { $st.Opacity = 0.9 }
  } else {
    $r.ring.Fill = [Windows.Media.Brushes]::White; $r.ring.StrokeThickness = 2; $r.ck.Visibility = 'Hidden'
    $r.tx.Opacity = 1
    $r.title.TextDecorations = $null
    if ($r.seal) { $r.seal.Opacity = 1 }
    $st.BeginAnimation([Windows.UIElement]::OpacityProperty, $null)
    $st.Visibility = 'Collapsed'
  }
}

function Toggle-Row([string]$id) {
  $r = Find-Row $id
  if (-not $r -or $r.pending) { return }
  $r.done = -not $r.done
  $r.pending = $true
  $script:anyChange = $true
  Set-RowLook $r $r.done $true
  Update-Say
  Say-Error ''
  $cmd = if ($r.done) { 'DONE' } else { 'UNDONE' }
  Send "$cmd $($r.id)"
}

# 並び順(key)どおりの位置に行を差し込む
function Insert-Row($r, [bool]$animate) {
  $idx = $script:rows.Count
  for ($i = 0; $i -lt $script:rows.Count; $i++) { if ([string]::CompareOrdinal($script:rows[$i].key, $r.key) -gt 0) { $idx = $i; break } }
  [void]$script:rows.Insert($idx, $r)
  $w.FindName('listP').Children.Insert($idx, $r.el)
  if (-not $script:expanded -and $idx -ge $script:limit) { $script:expanded = $true }
  Apply-Rows $false
  if ($animate) {
    $tt = New-Object Windows.Media.TranslateTransform(0, -10)
    $r.el.RenderTransform = $tt
    $tt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (New-Object Windows.Media.Animation.DoubleAnimation(-10, 0, [TimeSpan]::FromMilliseconds(360))))
    $r.el.BeginAnimation([Windows.UIElement]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(360))))
    $r.el.BringIntoView()
  }
  Update-Seps
}

# ---------- 追加フォーム ----------
function Select-Chip([int]$i) {
  $script:dueIdx = $i
  for ($k = 0; $k -lt $v.chips.Count; $k++) {
    $b = $w.FindName("chip$k"); $t = $w.FindName("chipT$k")
    if ($k -eq $i) { $b.Background = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString($purple)); $t.Foreground = [Windows.Media.Brushes]::White }
    else { $b.Background = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString('#F1ECFC')); $t.Foreground = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString('#6B5BB0')) }
  }
}
function Select-Label([int]$i) {
  $script:labIdx = $i
  for ($k = 0; $k -lt 3; $k++) {
    $g = $w.FindName("lab$k"); $b = $w.FindName("labB$k")
    if ($k -eq $i) { $g.Opacity = 1; $b.Background = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString('#F4EFFD')) }
    else { $g.Opacity = 0.4; $b.Background = [Windows.Media.Brushes]::Transparent }
  }
}
function Open-AddForm {
  $f = $w.FindName('addB')
  if ($f.Visibility -eq 'Visible') { $w.FindName('inp').Focus() | Out-Null; return }
  $f.Visibility = 'Visible'
  $w.FindName('plusBtn').Visibility = 'Hidden'
  $tt = New-Object Windows.Media.TranslateTransform(0, 10)
  $f.RenderTransform = $tt
  $tt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (New-Object Windows.Media.Animation.DoubleAnimation(10, 0, [TimeSpan]::FromMilliseconds(280))))
  $f.BeginAnimation([Windows.UIElement]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(280))))
  Apply-Size; Keep-Inside
  $w.Activate() | Out-Null
  $inp = $w.FindName('inp')
  $null = $w.Dispatcher.BeginInvoke([Action]{ $w.FindName('inp').Focus() | Out-Null; [Windows.Input.Keyboard]::Focus($w.FindName('inp')) | Out-Null }, [Windows.Threading.DispatcherPriority]::Input)
}
function Close-AddForm {
  $w.FindName('addB').Visibility = 'Collapsed'
  $w.FindName('plusBtn').Visibility = 'Visible'
  Say-Error ''
  Apply-Size; Keep-Inside
}
function Update-Placeholder { $w.FindName('ph').Visibility = if ($w.FindName('inp').Text.Length -gt 0) { 'Hidden' } else { 'Visible' } }

function Do-Add {
  $inp = $w.FindName('inp')
  if ($inp.IsReadOnly) { return }
  $title = ($inp.Text -replace '\s+', ' ').Trim()
  if (-not $title) { $inp.Focus() | Out-Null; return }
  if ([Globalization.StringInfo]::new($title).LengthInTextElements -gt 100) { Say-Error '100文字以内にしてね'; return }
  $labels = @('', 'work', 'private')
  $script:addSeq++
  $req = "a$($script:addSeq)"
  $script:adds[$req] = $true
  $inp.IsReadOnly = $true; $w.FindName('addBtn').IsEnabled = $false
  Say-Error ''
  Send ("ADD $req " + (To-B64 @{ title = $title; due = [string]$v.chips[$script:dueIdx].ymd; label = $labels[$script:labIdx] }))
}

function On-Added([string]$req, $item) {
  if (-not $script:adds.ContainsKey($req)) { return }
  $script:adds.Remove($req)
  $r = New-Row $item
  $script:total++
  if ($r.over) { $script:overdueTotal++ }
  $script:anyChange = $true
  Insert-Row $r $true
  Update-Say
  $inp = $w.FindName('inp'); $inp.IsReadOnly = $false; $inp.Text = ''; $w.FindName('addBtn').IsEnabled = $true
  $inp.Focus() | Out-Null
}
function On-AddErr([string]$req, [string]$why) {
  if (-not $script:adds.ContainsKey($req)) { return }
  $script:adds.Remove($req)
  $inp = $w.FindName('inp'); $inp.IsReadOnly = $false; $w.FindName('addBtn').IsEnabled = $true
  if ($why -eq 'too-long') { Say-Error '100文字以内にしてね' } elseif ($why -eq 'empty') { } else { Say-Error '保存できなかったよ…もう一度ためしてね' }
  $inp.Focus() | Out-Null
}

# ---------- 位置 ----------
$script:placed = $false
function Get-ScreenEnv {
  $src = [Windows.PresentationSource]::FromVisual($w)
  $k = if ($src) { $src.CompositionTarget.TransformFromDevice.M11 } else { 1.0 }
  $scr = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $a = $_.WorkingArea; @{ x = $a.X * $k; y = $a.Y * $k; w = $a.Width * $k; h = $a.Height * $k } })
  $sig = (@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $b = $_.Bounds; "$($b.X),$($b.Y),$($b.Width),$($b.Height)" }) -join ';') + "@$k"
  @{ sig = $sig; screens = $scr; win = @{ w = $w.ActualWidth; h = $w.ActualHeight }
     center = @{ x = $wa.Left + ($wa.Width - $w.ActualWidth) / 2; y = $wa.Top + [Math]::Max(0, ($wa.Height - $w.ActualHeight) / 2) } }
}
function Center-Window {
  $w.Left = $wa.Left + ($wa.Width - $w.ActualWidth) / 2
  $w.Top = $wa.Top + [Math]::Max(0, ($wa.Height - $w.ActualHeight) / 2)
}
# 高さが伸びたら、いまいる画面の下からはみ出さないように上へ寄せる
function Keep-Inside {
  $env = Get-ScreenEnv
  $cx = $w.Left + $w.ActualWidth / 2; $cy = $w.Top + 40
  $s = $env.screens | Where-Object { $cx -ge $_.x -and $cx -lt $_.x + $_.w -and $cy -ge $_.y -and $cy -lt $_.y + $_.h } | Select-Object -First 1
  if (-not $s) { $s = @{ x = $wa.Left; y = $wa.Top; w = $wa.Width; h = $wa.Height } }
  if ($w.Top + $w.ActualHeight -gt $s.y + $s.h) { $w.Top = [Math]::Max($s.y, $s.y + $s.h - $w.ActualHeight) }
}
function Reveal {
  if ($script:placed) { return }
  $script:placed = $true
  $a = New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(320))
  $w.BeginAnimation([Windows.Window]::OpacityProperty, $a)
  $tt = New-Object Windows.Media.TranslateTransform(0, 16)
  $w.FindName('root').RenderTransform = $tt
  $ra = New-Object Windows.Media.Animation.DoubleAnimation(16, 0, [TimeSpan]::FromMilliseconds(380))
  $ra.EasingFunction = New-Object Windows.Media.Animation.CubicEase
  $tt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $ra)
}
function Save-State {
  if (-not $script:placed) { return }
  $env = Get-ScreenEnv
  $st = @{ sig = $env.sig; expanded = $script:expanded; x = $null; y = $null; w = $script:userW; h = $script:userH }
  if ($script:hasPos) { $st.x = [Math]::Round($w.Left); $st.y = [Math]::Round($w.Top) }
  Send ("STATE " + (To-B64 $st))
}

# ---------- 展開/たたむ・大きさ ----------
function Apply-Rows([bool]$animate) {
  for ($i = 0; $i -lt $script:rows.Count; $i++) {
    $r = $script:rows[$i]
    $show = $script:expanded -or $i -lt $script:limit
    if ($show -and $r.el.Visibility -ne 'Visible') {
      $r.el.Visibility = 'Visible'
      if ($animate) { $r.el.BeginAnimation([Windows.UIElement]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(300)))) }
    } elseif (-not $show) { $r.el.Visibility = 'Collapsed' }
  }
  $hidden = [Math]::Max(0, $script:rows.Count - $script:limit)
  $mb = $w.FindName('moreB')
  if ($hidden -le 0) { $mb.Visibility = 'Collapsed' }
  else {
    $mb.Visibility = 'Visible'
    $w.FindName('more').Text = if ($script:expanded) { 'たたむ ▴' } else { "すべて見る(あと $($hidden)件) ▾" }
  }
  Update-Seps
}
function Toggle-Expand {
  $script:expanded = -not $script:expanded
  Apply-Rows $true
  if (-not $script:expanded) { $w.FindName('sv').ScrollToTop() }
  Save-State
}
# 一覧の幅に合わせて、タイトルの折り返し幅を変える
function Set-ListWidth([double]$rw) {
  $w.FindName('root').Width = $rw
  $w.Width = $rw + 48
  $script:titleMax = [int]($rw - 194)
  foreach ($r in $script:rows) { $r.title.MaxWidth = $script:titleMax }
}
# 一覧部分の高さの上限(ウィンドウが画面の高さに収まるように)
function Max-ListHeight {
  $sv = $w.FindName('sv')
  $fixed = $w.ActualHeight - $sv.ActualHeight
  [Math]::Max(120, $wa.Height - 8 - $fixed)
}
function Apply-Size {
  $sv = $w.FindName('sv')
  if ($script:userW) { Set-ListWidth ([Math]::Min(760, [Math]::Max(430, [double]$script:userW))) } else { Set-ListWidth 430 }
  $w.UpdateLayout()
  $mx = Max-ListHeight
  if ($script:userH) { $sv.MaxHeight = [double]::PositiveInfinity; $sv.Height = [Math]::Min($mx, [Math]::Max(120, [double]$script:userH)) }
  else { $sv.Height = [double]::NaN; $sv.MaxHeight = $mx }
}
function Reset-Size {
  $script:userW = $null; $script:userH = $null; $script:expanded = $false
  Apply-Rows $false
  $w.FindName('sv').ScrollToTop()
  Apply-Size
  Save-State
}

# ---------- node からの返事(標準入力)を読む ----------
function On-Reply([string]$line) {
  $p = $line.Trim().Split(' ')
  switch ($p[0]) {
    'OK' { $r = Find-Row $p[1]; if ($r -and $r.pending) { $r.pending = $false } }
    'ERR' {
      $r = Find-Row $p[1]
      if ($r -and $r.pending) {
        # 保存できなかったら元に戻す
        $r.pending = $false; $r.done = -not $r.done
        Set-RowLook $r $r.done $false
        Update-Say
        Say-Error '保存できなかったよ…もう一度ためしてね'
      }
    }
    'ADDED' { try { On-Added $p[1] (From-B64 $p[2]) } catch { On-AddErr $p[1] 'save' } }
    'ADDERR' { On-AddErr $p[1] $p[2] }
    'PLACE' {
      if (-not $script:placed) {
        if ($p[3] -ne '-') { $script:userW = [double]$p[3] }
        if ($p[4] -ne '-') { $script:userH = [double]$p[4] }
        if ($p[5] -eq '1') { $script:expanded = $true }
        if ($w.FindName('sv')) { Apply-Rows $false; Apply-Size }
        $w.UpdateLayout()
        $cx = $wa.Left + ($wa.Width - $w.ActualWidth) / 2
        $w.Left = [double]$p[1]; $w.Top = [double]$p[2]
        # node が「中央」と答えたとき(保存なし・画面外・モニター構成が変わった)は、今の大きさで中央に置き直す
        $script:hasPos = -not ($p[6] -eq 'c')
        if (-not $script:hasPos) { Center-Window }
        Keep-Inside; Reveal
        if ($env:SOMEDAY_DEBUG) { [Console]::Error.WriteLine("[show] placed at $($w.Left),$($w.Top) size=$($w.ActualWidth)x$($w.ActualHeight) userW=$($script:userW) userH=$($script:userH) expanded=$($script:expanded)") }
      }
    }
  }
}

# ---------- 中身をセット ----------
if ($v.kind -eq 'error') {
  $w.FindName('date').Text = 'いつかやること'
  $w.FindName('say1').Text = $v.say
  if ($v.path) { $w.FindName('path').Text = $v.path } else { $w.FindName('path').Visibility = 'Collapsed' }
  $w.FindName('say2').Text = $v.detail
} else {
  $w.FindName('date').Text = "$($v.dateLabel) · $($v.timeLabel)"
  foreach ($it in @($v.items)) { if ($it) { $r = New-Row $it; [void]$script:rows.Add($r); $w.FindName('listP').Children.Add($r.el) | Out-Null } }
  foreach ($it in @($v.rest)) { if ($it) { $r = New-Row $it; $r.el.Visibility = 'Collapsed'; [void]$script:rows.Add($r); $w.FindName('listP').Children.Add($r.el) | Out-Null } }
  $w.FindName('moreB').Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Toggle-Expand })
  Apply-Rows $false
  # 右下のつまみで大きさを変える(幅は 430〜760、高さは画面に収まる範囲)
  $grip = $w.FindName('grip')
  $grip.Add_DragDelta({ param($s, $e)
    $sv = $w.FindName('sv')
    $nw = [Math]::Min(760, [Math]::Max(430, $w.FindName('root').Width + $e.HorizontalChange))
    $cur = if ([double]::IsNaN($sv.Height)) { $sv.ActualHeight } else { $sv.Height }
    $mx = [Math]::Max(120, $wa.Height - 8 - ($w.ActualHeight - $sv.ActualHeight))
    $nh = [Math]::Min($mx, [Math]::Max(120, $cur + $e.VerticalChange))
    Set-ListWidth $nw
    $sv.MaxHeight = [double]::PositiveInfinity; $sv.Height = $nh
    $script:userW = [Math]::Round($nw); $script:userH = [Math]::Round($nh) })
  $grip.Add_DragCompleted({ Save-State })
  # ホイールで一覧をスクロール(行の文字の上でも効くように)
  $w.FindName('sv').Add_PreviewMouseWheel({ param($s, $e) $s.ScrollToVerticalOffset($s.VerticalOffset - $e.Delta / 2.5); $e.Handled = $true })
  Update-Say
  for ($i = 0; $i -lt $v.chips.Count; $i++) {
    $w.FindName("chipT$i").Text = $v.chips[$i].label
    $w.FindName("chip$i").ToolTip = if ($v.chips[$i].ymd) { $v.chips[$i].ymd } else { '期限なし(いつでも)' }
    $w.FindName("chip$i").Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Select-Chip ([int]$s.Tag) })
  }
  for ($i = 0; $i -lt 3; $i++) { $w.FindName("lab$i").Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Select-Label ([int]$s.Tag) }) }
  Select-Chip 0; Select-Label 0
  $inp = $w.FindName('inp')
  $inp.Add_TextChanged({ Update-Placeholder })
  $inp.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Return') { $e.Handled = $true; Do-Add } })
  $w.FindName('addBtn').Add_Click({ Do-Add })
  $w.FindName('cancelBtn').Add_Click({ Close-AddForm })
  $w.FindName('plusBtn').Add_Click({ Open-AddForm })
}


if ([Console]::IsInputRedirected -and $v.kind -eq 'list') {
  $script:inReader = New-Object IO.StreamReader([Console]::OpenStandardInput())
  $script:readTask = $script:inReader.ReadLineAsync()
  $script:inTimer = New-Object Windows.Threading.DispatcherTimer
  $script:inTimer.Interval = [TimeSpan]::FromMilliseconds(60)
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

$svI = $w.FindName('sv'); if ($svI) { $svI.MaxHeight = [Math]::Max(150, $wa.Height - 470) }
$w.MaxHeight = [System.Windows.SystemParameters]::VirtualScreenHeight
$w.Opacity = 0
$w.Add_PreviewKeyDown({ param($s, $e)
  if ($e.Key -ne 'Escape') { return }
  $inp = $w.FindName('inp')
  $f = $w.FindName('addB')
  if ($f -and $f.Visibility -eq 'Visible') { Close-AddForm; $e.Handled = $true; return }
  $s.Close() })
# どこを掴んでも移動できる(文字・入力欄・ボタン・チェックは除く)。離したら位置を保存
$w.Add_MouseLeftButtonDown({ param($s, $e)
  if ($e.OriginalSource -is [System.Windows.Controls.TextBox]) { return }
  $l0 = $s.Left; $t0 = $s.Top
  try { $s.DragMove() } catch {}
  if ([Math]::Abs($s.Left - $l0) -ge 1 -or [Math]::Abs($s.Top - $t0) -ge 1) { $script:hasPos = $true; Save-State } })
$w.FindName('x').Add_Click({ $w.Close() })
$w.FindName('close').Add_Click({ $w.Close() })
$w.FindName('mClose').Add_Click({ $w.Close() })
$w.FindName('mCenter').Add_Click({ Center-Window; Keep-Inside; $script:hasPos = $false; Save-State })
$w.FindName('mSize').Add_Click({ if ($w.FindName('sv')) { Reset-Size; Keep-Inside } })
$openBtn = $w.FindName('open')
if ($openBtn) { $openBtn.Add_Click({ Start-Process $v.appUrl; $w.Close() }) }
$w.Add_SizeChanged({ if ($script:placed) { Keep-Inside } })

$w.Add_Loaded({
  # 一覧部分だけスクロールにして、ウィンドウは画面の高さに収める
  if ($w.FindName('sv')) { Apply-Size }
  Center-Window
  # タスクスケジューラ(wscript の非表示起動)経由だと、起動時の「隠す」指定が最初の表示に引き継がれて
  # ウィンドウが見えないことがある。見えていなければ明示的に表示する
  $h = (New-Object Windows.Interop.WindowInteropHelper($w)).Handle
  if (-not [SomedayNotify.Win]::IsWindowVisible($h)) { [Console]::Error.WriteLine('[show] window was hidden at load; ShowWindow(SW_SHOW)'); [SomedayNotify.Win]::ShowWindow($h, 5) | Out-Null }
  [SomedayNotify.Win]::SetForegroundWindow($h) | Out-Null
  $w.Activate() | Out-Null
  # 前回動かした位置を node に聞く(返事が無ければ中央のまま出す)
  if ($script:inTimer) {
    Send ("PLACE " + (To-B64 (Get-ScreenEnv)))
    $script:pt = New-Object Windows.Threading.DispatcherTimer
    $script:pt.Interval = [TimeSpan]::FromMilliseconds(600)
    $script:pt.Add_Tick({ $script:pt.Stop(); Reveal })
    $script:pt.Start()
  } else { Reveal }
  # 最前面は数秒だけ
  $script:t = New-Object Windows.Threading.DispatcherTimer
  $script:t.Interval = [TimeSpan]::FromSeconds(5)
  $script:t.Add_Tick({ $script:t.Stop(); $w.Topmost = $false })
  $script:t.Start()

  # ---- 確認用の自動操作(マウス・キーボードは使わない) ----
  $script:auto = [System.Collections.Queue]::new()
  if ($AutoExpand) { $script:auto.Enqueue({ Toggle-Expand }) }
  if ($AutoAdd) {
    $script:auto.Enqueue({ Open-AddForm })
    foreach ($a in ($AutoAdd -split ';')) {
      $f = $a -split '\|'
      $script:auto.Enqueue([scriptblock]::Create("`$w.FindName('inp').Text = '$($f[0] -replace "'", "''")'; Select-Chip $([int]$f[1]); Select-Label $([int]$f[2]); Do-Add"))
    }
  }
  if ($AutoSeq) { foreach ($s in ($AutoSeq -split ',')) { $script:auto.Enqueue([scriptblock]::Create("Toggle-Row `$script:rows[$([int]$s)].id")) } }
  $delay = 1200 + 900 * $script:auto.Count
  if ($script:auto.Count -gt 0) {
    $script:at = New-Object Windows.Threading.DispatcherTimer
    $script:at.Interval = [TimeSpan]::FromMilliseconds(900)
    $script:at.Add_Tick({ if ($script:auto.Count -eq 0) { $script:at.Stop(); return }; & $script:auto.Dequeue() })
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
