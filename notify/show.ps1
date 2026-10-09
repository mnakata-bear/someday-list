# いつかやること: 通知ウィンドウ「ふきだし」(WPF / PowerShell 5.1)。index.mjs から呼ばれる。見た目は mock-dialog-cute.html の .v2。
# -Json: 表示内容(index.mjs が作る)  -Icon: ペンギンのアイコン PNG  -Shot: 見た目確認用(画面を PNG 保存して閉じる)
# 確認用(マウスを動かさずに操作する。-Shot のときはフォーカスを取らない): -AutoMini ミニ表示にする / -AutoSeq "0,1,0" 行のチェックを順に押す / -AutoAdd "タイトル|期限キー|ラベル;..." 追加 / -AutoExpand 「ほか N件」を開く / -AutoEdit "行|タイトル|期限|ラベル(0-2)|メモ" 編集して保存 / -AutoDelete "行" 削除
# node とは1行プロトコルでやりとりする(詳しくは proto.mjs)。
param([Parameter(Mandatory)][string]$Json, [string]$Icon, [string]$Shot, [string]$AutoSeq, [string]$AutoAdd, [switch]$AutoExpand, [switch]$AutoMini, [string]$AutoEdit, [string]$AutoDelete)
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
  <Grid x:Name='nm' Margin='2,6,2,6'>
    <Grid.ColumnDefinitions><ColumnDefinition Width='44'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto' MinWidth='52'/><ColumnDefinition Width='Auto'/></Grid.ColumnDefinitions>
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
    <StackPanel x:Name='ib' Grid.Column='3' Orientation='Horizontal' VerticalAlignment='Center' Opacity='0.38'>
      <Border x:Name='ed' Width='30' Height='44' Background='Transparent' Cursor='Hand' ToolTip='編集'>
        <Path Width='16' Height='16' Stretch='Uniform' Stroke='$mute' StrokeThickness='1.7' StrokeLineJoin='Round' StrokeStartLineCap='Round' StrokeEndLineCap='Round' Data='M3,13 L3.7,10 L11,2.7 L13.3,5 L6,12.3 Z M9.6,4.1 L11.9,6.4'/>
      </Border>
      <Border x:Name='del' Width='30' Height='44' Background='Transparent' Cursor='Hand' ToolTip='削除'>
        <Path Width='16' Height='16' Stretch='Uniform' Stroke='$mute' StrokeThickness='1.7' StrokeLineJoin='Round' StrokeStartLineCap='Round' StrokeEndLineCap='Round' Data='M2.5,4.5 H13.5 M6,4.5 V2.8 H10 V4.5 M4,4.5 L4.8,13.2 H11.2 L12,4.5 M6.8,7 V11 M9.2,7 V11'/>
      </Border>
    </StackPanel>
  </Grid>
  <Grid x:Name='eh' Margin='2,8,2,8' Visibility='Collapsed'/>
</Grid>
"@
  $el = [Windows.Markup.XamlReader]::Parse($x)
  $el.FindName('t').Text = $it.title
  $el.FindName('d').Text = $it.due
  $l = $el.FindName('l'); if ($l) { $l.Text = $it.label }
  $c = $el.FindName('c'); $c.Tag = [string]$it.id
  $c.Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Toggle-Row ([string]$s.Tag) })
  $b1 = $el.FindName('ed'); $b1.Tag = [string]$it.id
  $b1.Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Open-Edit ([string]$s.Tag) })
  $b2 = $el.FindName('del'); $b2.Tag = [string]$it.id
  $b2.Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Delete-Row ([string]$s.Tag) })
  # 編集・削除のアイコンは、行にマウスを乗せると濃くなる
  $el.Add_MouseEnter({ param($s, $e) $s.FindName('ib').Opacity = 0.95 })
  $el.Add_MouseLeave({ param($s, $e) $s.FindName('ib').Opacity = 0.38 })
  @{ id = [string]$it.id; key = [string]$it.key; over = $over; done = $false; pending = $false; deleted = $false; el = $el
     nm = $el.FindName('nm'); eh = $el.FindName('eh'); dueYmd = [string]$it.dueYmd; note = [string]$it.note; labelKey = [string]$it.labelKey; ca = $it.ca; titleRaw = [string]$it.title
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
<Border x:Name='toast' Margin='0,12,0,0' CornerRadius='18' Background='#EE2E2A4A' Padding='16,7,7,7' Visibility='Collapsed' HorizontalAlignment='Left'>
  <Border.Effect><DropShadowEffect BlurRadius='18' ShadowDepth='6' Direction='270' Opacity='0.35' Color='#281E64'/></Border.Effect>
  <StackPanel Orientation='Horizontal'>
    <TextBlock x:Name='toastT' Text='削除しました' Foreground='White' FontSize='13' FontWeight='ExtraBold' VerticalAlignment='Center'/>
    <Border x:Name='toastUndo' Margin='14,0,0,0' CornerRadius='14' Background='#8A6FE0' Padding='13,6' Cursor='Hand' ToolTip='削除を取り消す'>
      <TextBlock Text='元に戻す' Foreground='White' FontSize='12.5' FontWeight='ExtraBold'/>
    </Border>
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
      <MenuItem x:Name='mMini' Header='小さくする'/>
      <MenuItem x:Name='mTop' Header='ミニ表示を常に最前面に' IsCheckable='True' IsChecked='True'/>
      <Separator/>
      <MenuItem x:Name='mCenter' Header='中央に戻す'/>
      <MenuItem x:Name='mSize' Header='元の大きさに戻す'/>
      <MenuItem x:Name='mClose' Header='閉じる'/>
    </ContextMenu>
  </Window.ContextMenu>
  <Grid Margin='24'>
    <StackPanel x:Name='root' Width='430' HorizontalAlignment='Center'>
      <Grid>
        <Grid.ColumnDefinitions><ColumnDefinition Width='Auto'/><ColumnDefinition Width='*'/><ColumnDefinition Width='Auto'/></Grid.ColumnDefinitions>
        <Grid x:Name='avG' Width='72' Height='72' VerticalAlignment='Bottom' Cursor='Hand' ToolTip='ダブルクリックで小さく / 元に戻す' RenderTransformOrigin='0.5,0.5'>
          <Border x:Name='av' CornerRadius='36' BorderBrush='White' BorderThickness='4' Background='White'>
            <Border.Effect><DropShadowEffect BlurRadius='20' ShadowDepth='8' Direction='270' Opacity='0.5' Color='#281E64'/></Border.Effect>
          </Border>
          <Border x:Name='badge' Visibility='Collapsed' MinWidth='26' Height='26' CornerRadius='13' Padding='6,0' HorizontalAlignment='Right' VerticalAlignment='Top' Margin='0,-6,-8,0' BorderBrush='White' BorderThickness='2.5' Background='$red'>
            <Border.Effect><DropShadowEffect BlurRadius='8' ShadowDepth='2' Direction='270' Opacity='0.35' Color='#281E64'/></Border.Effect>
            <TextBlock x:Name='badgeT' Foreground='White' FontSize='12' FontWeight='ExtraBold' HorizontalAlignment='Center' VerticalAlignment='Center'/>
          </Border>
        </Grid>
        <Border x:Name='sayB' Grid.Column='1' Margin='12,0,8,0' CornerRadius='22,22,22,6' Background='White' Padding='16,12,16,12' VerticalAlignment='Bottom' HorizontalAlignment='Left'>
          <Border.Effect><DropShadowEffect BlurRadius='24' ShadowDepth='10' Direction='270' Opacity='0.3' Color='#281E64'/></Border.Effect>
          <StackPanel>
            <TextBox x:Name='date' $ro FontSize='11' FontWeight='ExtraBold' Foreground='$purple'/>
            $sayInner
          </StackPanel>
        </Border>
        <Button x:Name='x' Grid.Column='2' Style='{StaticResource XBtn}' VerticalAlignment='Top' ToolTip='閉じる (Esc)・右クリックで「中央に戻す」'/>
      </Grid>
      $listAndAdd
      <Grid x:Name='foot' Margin='0,16,4,4'>
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
$script:titleMax = 216
$script:mini = $false; $script:miniTop = $true; $script:mx = $null; $script:my = $null
$script:nx = $null; $script:ny = $null
$script:addWasOpen = $false
$script:quiet = [bool]$Shot   # 撮影(確認用)のときはフォーカスを取らない
$script:labIdx = 0

function Update-Say {
  # のこり件数: 完了にした行・削除した行は数えない
  $live = @($script:rows | Where-Object { -not $_.deleted -and -not $_.done })
  $left = $live.Count
  $overLeft = @($live | Where-Object { $_.over }).Count
  $s1 = $w.FindName('say1'); $s2 = $w.FindName('say2'); $s3 = $w.FindName('say3')
  if ($left -le 0) {
    $s1.Text = if ($script:anyChange) { 'ぜんぶ終わったね！' } else { 'ぜんぶ終わってるよ！' }
    $s2.Visibility = 'Collapsed'; $s3.Visibility = 'Collapsed'
  } else {
    $s1.Text = "$($v.greeting)いつかやること、"
    $s2.Visibility = 'Visible'; $s2.Text = "のこり $($left)件だよ"
    if ($overLeft -gt 0) { $s3.Visibility = 'Visible'; $s3.Text = "期限切れが $($overLeft)件あるよ" } else { $s3.Visibility = 'Collapsed' }
  }
  if (-not $script:mini) { $w.FindName('listB').Visibility = if (@($script:rows | Where-Object { -not $_.deleted }).Count -gt 0) { 'Visible' } else { 'Collapsed' } }
  # ミニ表示のバッジ(のこり件数。期限切れがあれば赤、なければ紫)
  $w.FindName('badgeT').Text = if ($left -gt 99) { '99+' } else { [string][Math]::Max(0, $left) }
  $w.FindName('badge').Background = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString($(if ($overLeft -gt 0) { $red } else { $purple })))
  $script:badgeLeft = $left
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
  if ($script:quiet) { return }
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
  $st = @{ sig = $env.sig; expanded = $script:expanded; x = $null; y = $null; w = $script:userW; h = $script:userH
          mini = $script:mini; mx = $script:mx; my = $script:my; miniTop = $script:miniTop }
  if ($script:hasPos -and $null -ne $script:nx) { $st.x = [Math]::Round($script:nx); $st.y = [Math]::Round($script:ny) }
  Send ("STATE " + (To-B64 $st))
}

# ---------- 展開/たたむ・大きさ ----------
function Apply-Rows([bool]$animate) {
  $vis = 0
  foreach ($r in $script:rows) {
    if ($r.deleted) { $r.el.Visibility = 'Collapsed'; continue }
    $show = $script:expanded -or $vis -lt $script:limit
    $vis++
    if ($show -and $r.el.Visibility -ne 'Visible') {
      $r.el.Visibility = 'Visible'
      if ($animate) { $r.el.BeginAnimation([Windows.UIElement]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(300)))) }
    } elseif (-not $show) { $r.el.Visibility = 'Collapsed' }
  }
  $hidden = [Math]::Max(0, $vis - $script:limit)
  $mb = $w.FindName('moreB')
  if ($hidden -le 0 -and -not ($script:expanded -and $vis -gt $script:limit)) { $mb.Visibility = 'Collapsed' }
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
  $script:titleMax = [int]($rw - 214)
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

# ---------- 編集(行の中で、「追加」と同じ部品で) ----------
$script:ef = $null
$script:editing = $null
$script:edits = @{}
$script:eLab = 0
$script:editSeq = 0
function Build-EditForm {
  $chips = ''
  for ($i = 0; $i -lt $v.chips.Count; $i++) {
    $chips += "<Border x:Name='echip$i' Tag='$i' CornerRadius='12' Padding='11,4' Margin='0,0,6,6' Cursor='Hand'><TextBlock x:Name='echipT$i' FontSize='12' FontWeight='ExtraBold'/></Border>"
  }
  $labs = ''
  $defs = @(@('なし', '#9C93B8'), @('仕事', $purple), @('プライベート', $pink))
  for ($i = 0; $i -lt 3; $i++) {
    $c = $defs[$i][1]
    $labs += @"
<Grid x:Name='elab$i' Tag='$i' Margin='2,0,10,6' Cursor='Hand' Background='Transparent' RenderTransformOrigin='0.5,0.5'>
  <Grid.RenderTransform><RotateTransform Angle='-6'/></Grid.RenderTransform>
  <Border x:Name='elabB$i' BorderBrush='$c' BorderThickness='1.5' CornerRadius='8' Padding='9,3'><TextBlock Text='$($defs[$i][0])' FontSize='11' FontWeight='ExtraBold' Foreground='$c'/></Border>
  <Rectangle Margin='2.5' RadiusX='5' RadiusY='5' Stroke='$c' StrokeThickness='1' StrokeDashArray='3 2' Opacity='0.55' IsHitTestVisible='False'/>
</Grid>
"@
  }
  $x = @"
<Border $ns CornerRadius='16' Background='#F7F4FE' BorderBrush='#E3DAF8' BorderThickness='1' Padding='12,10,12,8'>
  <StackPanel>
    <Border CornerRadius='12' Background='White' BorderBrush='#E3DAF8' BorderThickness='1'>
      <TextBox x:Name='etitle' BorderThickness='0' Background='Transparent' Padding='10,8' FontSize='14' FontWeight='Bold' Foreground='$ink' MaxLength='300' VerticalContentAlignment='Center'/>
    </Border>
    <WrapPanel Margin='0,10,0,0'>
      <TextBlock Text='期限' FontSize='11.5' FontWeight='ExtraBold' Foreground='$mute' VerticalAlignment='Top' Margin='2,4,8,0'/>
      $chips
    </WrapPanel>
    <StackPanel Orientation='Horizontal' Margin='0,0,0,8'>
      <TextBlock Text='日付' FontSize='11.5' FontWeight='ExtraBold' Foreground='$mute' VerticalAlignment='Center' Margin='2,0,8,0'/>
      <Border CornerRadius='10' Background='White' BorderBrush='#E3DAF8' BorderThickness='1' Width='132'>
        <Grid>
          <TextBox x:Name='edue' BorderThickness='0' Background='Transparent' Padding='9,5' FontSize='13' FontWeight='Bold' Foreground='$ink' MaxLength='10'/>
          <TextBlock x:Name='eduePh' Text='2026-11-30' Margin='11,0,0,0' VerticalAlignment='Center' FontSize='13' Foreground='#B5ABD0' IsHitTestVisible='False'/>
        </Grid>
      </Border>
      <TextBlock x:Name='edueNow' FontSize='11.5' FontWeight='Bold' Foreground='$mute' VerticalAlignment='Center' Margin='10,0,0,0'/>
    </StackPanel>
    <WrapPanel>
      <TextBlock Text='ラベル' FontSize='11.5' FontWeight='ExtraBold' Foreground='$mute' VerticalAlignment='Top' Margin='2,4,8,0'/>
      $labs
    </WrapPanel>
    <Border CornerRadius='12' Background='White' BorderBrush='#E3DAF8' BorderThickness='1' Margin='0,2,0,0'>
      <Grid>
        <TextBox x:Name='enote' BorderThickness='0' Background='Transparent' Padding='10,8' FontSize='13' Foreground='$ink' MaxLength='2000' AcceptsReturn='True' TextWrapping='Wrap' MinHeight='62' MaxHeight='140' VerticalScrollBarVisibility='Auto'/>
        <TextBlock x:Name='enotePh' Text='メモ(任意)' Margin='12,9,0,0' VerticalAlignment='Top' FontSize='13' Foreground='#B5ABD0' IsHitTestVisible='False'/>
      </Grid>
    </Border>
    <TextBlock x:Name='eerr' Margin='2,6,0,0' FontSize='12.5' FontWeight='ExtraBold' Foreground='$red' Visibility='Collapsed' TextWrapping='Wrap'/>
    <StackPanel Orientation='Horizontal' HorizontalAlignment='Right' Margin='0,8,0,0'>
      <Button x:Name='ecancel' Style='{DynamicResource Ghost}' Height='40' MinWidth='80' Content='やめる' ToolTip='やめる (Esc)'/>
      <Button x:Name='esave' Style='{DynamicResource Primary}' Height='40' Content='保存' Margin='8,0,0,0' ToolTip='保存 (Enter)'/>
    </StackPanel>
  </StackPanel>
</Border>
"@
  $f = [Windows.Markup.XamlReader]::Parse($x)
  for ($i = 0; $i -lt $v.chips.Count; $i++) {
    $f.FindName("echipT$i").Text = $v.chips[$i].label
    $f.FindName("echip$i").Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; $f2 = $script:ef; $f2.FindName('edue').Text = [string]$v.chips[[int]$s.Tag].ymd })
  }
  for ($i = 0; $i -lt 3; $i++) { $f.FindName("elab$i").Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Select-ELabel ([int]$s.Tag) }) }
  $f.FindName('edue').Add_TextChanged({ Sync-EditChips })
  $f.FindName('enote').Add_TextChanged({ $f2 = $script:ef; $f2.FindName('enotePh').Visibility = if ($f2.FindName('enote').Text.Length -gt 0) { 'Hidden' } else { 'Visible' } })
  $f.FindName('etitle').Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Return') { $e.Handled = $true; Do-Edit } })
  $f.FindName('esave').Add_Click({ Do-Edit })
  $f.FindName('ecancel').Add_Click({ Close-Edit })
  $script:ef = $f
}
function Sync-EditChips {
  $f = $script:ef; if (-not $f) { return }
  $t = $f.FindName('edue').Text.Trim()
  $f.FindName('eduePh').Visibility = if ($t.Length -gt 0) { 'Hidden' } else { 'Visible' }
  for ($i = 0; $i -lt $v.chips.Count; $i++) {
    $on = ($t -eq [string]$v.chips[$i].ymd)
    $f.FindName("echip$i").Background = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString($(if ($on) { $purple } else { '#EDE7FB' })))
    $f.FindName("echipT$i").Foreground = if ($on) { [Windows.Media.Brushes]::White } else { New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString('#6B5BB0')) }
  }
}
function Select-ELabel([int]$i) {
  $script:eLab = $i
  for ($k = 0; $k -lt 3; $k++) {
    $g = $script:ef.FindName("elab$k"); $b = $script:ef.FindName("elabB$k")
    if ($k -eq $i) { $g.Opacity = 1; $b.Background = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString('#F4EFFD')) }
    else { $g.Opacity = 0.4; $b.Background = [Windows.Media.Brushes]::Transparent }
  }
}
function Edit-Error([string]$msg) {
  $e = $script:ef.FindName('eerr')
  if ($msg) { $e.Text = $msg; $e.Visibility = 'Visible' } else { $e.Visibility = 'Collapsed' }
}
function Open-Edit([string]$id) {
  $r = Find-Row $id
  if (-not $r -or $r.pending -or $r.deleted) { return }
  if ($script:editing -and $script:editing.id -eq $id) { return }
  Close-Edit
  if (-not $script:ef) { Build-EditForm }
  $f = $script:ef
  $f.FindName('etitle').Text = $r.titleRaw
  $f.FindName('edue').Text = $r.dueYmd
  $f.FindName('edueNow').Text = if ($r.dueYmd) { "いまの期限 $($r.dueYmd)" } else { 'いまは期限なし' }
  $f.FindName('enote').Text = $r.note
  $f.FindName('enotePh').Visibility = if ($r.note.Length -gt 0) { 'Hidden' } else { 'Visible' }
  Select-ELabel $(if ($r.labelKey -eq 'work') { 1 } elseif ($r.labelKey -eq 'private') { 2 } else { 0 })
  Edit-Error ''
  $f.FindName('esave').IsEnabled = $true; $f.FindName('etitle').IsReadOnly = $false
  Sync-EditChips
  $r.nm.Visibility = 'Collapsed'; $r.eh.Visibility = 'Visible'
  $r.eh.Children.Add($f) | Out-Null
  $script:editing = $r
  $f.BeginAnimation([Windows.UIElement]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(240))))
  $r.el.BringIntoView()
  if (-not $script:quiet) {
    $w.Activate() | Out-Null
    $null = $w.Dispatcher.BeginInvoke([Action]{ $t = $script:ef.FindName('etitle'); $t.Focus() | Out-Null; [Windows.Input.Keyboard]::Focus($t) | Out-Null; $t.SelectAll() }, [Windows.Threading.DispatcherPriority]::Input)
  }
}
function Close-Edit {
  $r = $script:editing
  if (-not $r) { return }
  $script:editing = $null
  $r.eh.Children.Clear()
  $r.eh.Visibility = 'Collapsed'; $r.nm.Visibility = 'Visible'
}
function Do-Edit {
  $r = $script:editing; if (-not $r) { return }
  $f = $script:ef
  $title = ($f.FindName('etitle').Text -replace '\s+', ' ').Trim()
  if (-not $title) { $f.FindName('etitle').Focus() | Out-Null; return }
  if ([Globalization.StringInfo]::new($title).LengthInTextElements -gt 100) { Edit-Error '100文字以内にしてね'; return }
  $labels = @('', 'work', 'private')
  $script:editSeq++
  $req = "e$($script:editSeq)"
  $script:edits[$req] = $r.id
  $f.FindName('esave').IsEnabled = $false; $f.FindName('etitle').IsReadOnly = $true
  Edit-Error ''; Say-Error ''
  Send ("EDIT $req " + (To-B64 @{ id = $r.id; title = $title; due = $f.FindName('edue').Text.Trim(); note = $f.FindName('enote').Text; label = $labels[$script:eLab]; ca = $r.ca }))
}
function On-Edited([string]$req, $item) {
  if (-not $script:edits.ContainsKey($req)) { return }
  $id = $script:edits[$req]; $script:edits.Remove($req)
  $old = Find-Row $id
  if (-not $old) { return }
  if ($script:editing -and $script:editing.id -eq $id) { Close-Edit }
  $nr = New-Row $item
  $nr.done = $old.done
  if ($old.done) { Set-RowLook $nr $true $false }
  $w.FindName('listP').Children.Remove($old.el)
  $script:rows.Remove($old)
  Insert-Row $nr $true
  Update-Say
}
function On-EditErr([string]$req, [string]$why) {
  if (-not $script:edits.ContainsKey($req)) { return }
  $id = $script:edits[$req]; $script:edits.Remove($req)
  $f = $script:ef
  if ($f) { $f.FindName('esave').IsEnabled = $true; $f.FindName('etitle').IsReadOnly = $false }
  switch ($why) {
    'gone' {
      # 他の端末で消された: 行を片づける
      $old = Find-Row $id
      if ($old) { if ($script:editing -and $script:editing.id -eq $id) { Close-Edit }; $old.deleted = $true; Apply-Rows $false; Update-Say }
      Say-Error 'もう無いよ(他の端末で消されたみたい)'
    }
    'too-long' { Edit-Error '100文字以内にしてね' }
    'note-too-long' { Edit-Error 'メモは2000文字以内にしてね' }
    'bad-due' { Edit-Error '日付が正しくないよ(例 2026-11-30)' }
    'empty' { Edit-Error 'やることを入力してね' }
    default { Edit-Error '保存できなかったよ…もう一度ためしてね'; Say-Error '保存できなかったよ…もう一度ためしてね' }
  }
}

# ---------- 削除(約6秒は「元に戻す」できる。確定は node 側で、6秒後かダイアログを閉じるとき) ----------
$script:toastTimer = $null
$script:toastId = $null
function Show-Toast([string]$id) {
  $script:toastId = $id
  $t = $w.FindName('toast')
  $t.Visibility = 'Visible'
  $t.BeginAnimation([Windows.UIElement]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(220))))
  if ($script:toastTimer) { $script:toastTimer.Stop() }
  $script:toastTimer = New-Object Windows.Threading.DispatcherTimer
  $script:toastTimer.Interval = [TimeSpan]::FromSeconds(6)
  $script:toastTimer.Add_Tick({ $script:toastTimer.Stop(); $w.FindName('toast').Visibility = 'Collapsed'; $script:toastId = $null })
  $script:toastTimer.Start()
}
function Hide-Toast { if ($script:toastTimer) { $script:toastTimer.Stop() }; $w.FindName('toast').Visibility = 'Collapsed'; $script:toastId = $null }
function Delete-Row([string]$id) {
  $r = Find-Row $id
  if (-not $r -or $r.deleted) { return }
  if ($script:editing -and $script:editing.id -eq $id) { Close-Edit }
  $r.deleted = $true
  $script:anyChange = $true
  $an = New-Object Windows.Media.Animation.DoubleAnimation(1, 0.15, [TimeSpan]::FromMilliseconds(220))
  $an.Add_Completed({ Apply-Rows $false })
  $r.el.BeginAnimation([Windows.UIElement]::OpacityProperty, $an)
  Update-Say
  Say-Error ''
  Send "DELETE $id"
  Show-Toast $id
}
function Restore-Row($r) {
  $r.deleted = $false
  $r.el.BeginAnimation([Windows.UIElement]::OpacityProperty, $null)
  $r.el.Opacity = 1
  $r.el.Visibility = 'Visible'
  Apply-Rows $true
  Update-Say
}
function Undo-Delete {
  $id = $script:toastId
  if (-not $id) { return }
  $r = Find-Row $id
  Hide-Toast
  if (-not $r -or -not $r.deleted) { return }
  Send "UNDELETE $id"
  Restore-Row $r
}

# ---------- ミニ表示(ペンギンの顔だけ) ----------
function Avatar-Offset { $p = $w.FindName('avG').TranslatePoint((New-Object Windows.Point(0, 0)), $w); $p }
function Set-NormalParts([string]$vis) {
  foreach ($n in 'sayB', 'x', 'foot') { $w.FindName($n).Visibility = $vis }
}
function Enter-Mini([bool]$animate) {
  if ($script:mini) { return }
  if ($w.FindName('listB') -eq $null) { return }
  $off = Avatar-Offset
  $ax = $w.Left + $off.X; $ay = $w.Top + $off.Y
  $script:addWasOpen = ($w.FindName('addB').Visibility -eq 'Visible')
  $script:mini = $true
  Set-NormalParts 'Collapsed'
  $w.FindName('listB').Visibility = 'Collapsed'; $w.FindName('addB').Visibility = 'Collapsed'
  $w.FindName('badge').Visibility = 'Visible'
  $w.FindName('root').Width = 72; $w.Width = 120
  $w.UpdateLayout()
  if ($null -ne $script:mx) { $w.Left = $script:mx; $w.Top = $script:my } else { $w.Left = $ax - 24; $w.Top = $ay - 24; $script:mx = $w.Left; $script:my = $w.Top }
  $w.Topmost = $script:miniTop
  $w.FindName('mMini').Header = '元に戻す'
  if ($animate) {
    $sc = New-Object Windows.Media.ScaleTransform(1.25, 1.25)
    $w.FindName('avG').RenderTransform = $sc
    $an = New-Object Windows.Media.Animation.DoubleAnimation(1.25, 1, [TimeSpan]::FromMilliseconds(220))
    $an.EasingFunction = New-Object Windows.Media.Animation.CubicEase
    $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $an); $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $an)
  }
  Save-State
}
function Exit-Mini {
  if (-not $script:mini) { return }
  $mL = $w.Left; $mT = $w.Top
  $script:mini = $false
  $w.FindName('badge').Visibility = 'Collapsed'
  Set-NormalParts 'Visible'
  if ($script:addWasOpen) { $w.FindName('addB').Visibility = 'Visible' }
  Update-Say
  $w.Opacity = 0
  Apply-Size
  $w.UpdateLayout()
  $off = Avatar-Offset
  # ミニのペンギンの位置に、通常表示のペンギンがくるように置く(画面からはみ出す分は node 側で寄せる)
  $env = Get-ScreenEnv
  $script:expandEnv = @{ anchor = @{ x = $mL + 24 - $off.X; y = $mT + 24 - $off.Y }; at = @{ x = $mL + 60; y = $mT + 60 }; win = @{ w = $w.ActualWidth; h = $w.ActualHeight }; screens = $env.screens }
  $w.Left = $script:expandEnv.anchor.x; $w.Top = $script:expandEnv.anchor.y
  $w.Topmost = $false
  $w.FindName('mMini').Header = '小さくする'
  $sc = New-Object Windows.Media.ScaleTransform(0.96, 0.96)
  $w.FindName('root').RenderTransform = $sc
  if ($script:inTimer) {
    Send ("EXPAND " + (To-B64 $script:expandEnv))
    $script:et = New-Object Windows.Threading.DispatcherTimer
    $script:et.Interval = [TimeSpan]::FromMilliseconds(500)
    $script:et.Add_Tick({ $script:et.Stop(); Finish-Expand $null $null })
    $script:et.Start()
  } else { Finish-Expand $null $null }
}
function Finish-Expand($x, $y) {
  if ($script:et) { $script:et.Stop() }
  if ($null -ne $x) { $w.Left = $x; $w.Top = $y } else { Keep-Inside }
  $script:hasPos = $true; $script:nx = $w.Left; $script:ny = $w.Top
  if ($env:SOMEDAY_DEBUG) { [Console]::Error.WriteLine("[show] expanded to $($w.Left),$($w.Top) size=$($w.ActualWidth)x$($w.ActualHeight) (node=$($null -ne $x))") }
  $w.BeginAnimation([Windows.Window]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(220))))
  $sc = $w.FindName('root').RenderTransform
  $an = New-Object Windows.Media.Animation.DoubleAnimation(0.96, 1, [TimeSpan]::FromMilliseconds(240))
  $an.EasingFunction = New-Object Windows.Media.Animation.CubicEase
  $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $an); $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $an)
  Save-State
}
function Toggle-Mini { if ($script:mini) { Exit-Mini } else { Enter-Mini $true } }
function Bring-Front {
  if ($w.WindowState -eq 'Minimized') { $w.WindowState = 'Normal' }
  $w.Topmost = $true
  if (-not $script:quiet) { $h = (New-Object Windows.Interop.WindowInteropHelper($w)).Handle; [SomedayNotify.Win]::SetForegroundWindow($h) | Out-Null; $w.Activate() | Out-Null }
  $script:t.Stop(); $script:t.Start()
}
# 2つ目の起動(定時)から届いた最新の一覧に入れ替える
function Load-View($nv) {
  $script:v = $nv
  Close-Edit
  $script:rows.Clear(); $w.FindName('listP').Children.Clear()
  $script:total = [int]$nv.total; $script:overdueTotal = [int]$nv.overdue; $script:anyChange = $false
  foreach ($it in @($nv.items) + @($nv.rest)) { if ($it) { $r = New-Row $it; [void]$script:rows.Add($r); $w.FindName('listP').Children.Add($r.el) | Out-Null } }
  $w.FindName('date').Text = "$($nv.dateLabel) · $($nv.timeLabel)"
  Apply-Rows $false
  Update-Say
  if (-not $script:mini) { Apply-Size }
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
    'EDITED' { try { On-Edited $p[1] (From-B64 $p[2]) } catch { On-EditErr $p[1] 'save' } }
    'EDITERR' { On-EditErr $p[1] $p[2] }
    'DELERR' {
      # 削除を確定できなかった: 行を元に戻す
      $r = Find-Row $p[1]
      if ($r -and $r.deleted) { Restore-Row $r; Say-Error '削除できなかったよ…もう一度ためしてね' }
    }
    'UNDOERR' {
      # 取り消しが間に合わなかった(すでに削除された)
      $r = Find-Row $p[1]
      if ($r -and -not $r.deleted) { $r.deleted = $true; Apply-Rows $false; Update-Say }
      Say-Error 'もう消えちゃってたよ'
    }
    'PLACE' {
      if (-not $script:placed) {
        $pl = From-B64 $p[1]
        if ($pl.w) { $script:userW = [double]$pl.w }
        if ($pl.h) { $script:userH = [double]$pl.h }
        if ($pl.expanded) { $script:expanded = $true }
        $script:miniTop = [bool]$pl.miniTop; $w.FindName('mTop').IsChecked = $script:miniTop
        if ($null -ne $pl.mx) { $script:mx = [double]$pl.mx; $script:my = [double]$pl.my }
        if ($w.FindName('sv')) { Apply-Rows $false; Apply-Size }
        $w.UpdateLayout()
        $w.Left = [double]$pl.x; $w.Top = [double]$pl.y
        # node が「中央」と答えたとき(保存なし・画面外・モニター構成が変わった)は、今の大きさで中央に置き直す
        $script:hasPos = -not $pl.centered
        if (-not $script:hasPos) { Center-Window }
        Keep-Inside
        $script:nx = $w.Left; $script:ny = $w.Top
        if ($pl.mini) { Enter-Mini $false }
        Reveal
        if ($env:SOMEDAY_DEBUG) { [Console]::Error.WriteLine("[show] placed at $($w.Left),$($w.Top) size=$($w.ActualWidth)x$($w.ActualHeight) userW=$($script:userW) userH=$($script:userH) expanded=$($script:expanded) mini=$($script:mini)") }
      }
    }
    'EXPANDTO' { if (-not $script:mini) { Finish-Expand ([double]$p[1]) ([double]$p[2]) } }
    'RELOAD' { try { Load-View (From-B64 $p[1]) } catch { [Console]::Error.WriteLine("[show] reload failed: $_") } }
    'OPEN' { if ($p[1] -eq 'normal') { Exit-Mini }; Bring-Front }
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
  $w.FindName('toastUndo').Add_PreviewMouseLeftButtonDown({ param($s, $e) $e.Handled = $true; Undo-Delete })
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
if ($script:quiet) { $w.ShowActivated = $false }
$w.Add_PreviewKeyDown({ param($s, $e)
  if ($e.Key -ne 'Escape') { return }
  $inp = $w.FindName('inp')
  if ($script:editing) { Close-Edit; $e.Handled = $true; return }
  $f = $w.FindName('addB')
  if ($f -and $f.Visibility -eq 'Visible') { Close-AddForm; $e.Handled = $true; return }
  $s.Close() })
# どこを掴んでも移動できる(文字・入力欄・ボタン・チェックは除く)。離したら位置を保存
# ペンギンのダブルクリックで、ミニ表示(顔だけ) ⇔ 元の大きさ
$w.Add_MouseLeftButtonDown({ param($s, $e)
  if ($e.OriginalSource -is [System.Windows.Controls.TextBox]) { return }
  if ($e.ClickCount -ge 2 -and $w.FindName('avG').IsMouseOver -and $v.kind -eq 'list') { $e.Handled = $true; Toggle-Mini; return }
  $l0 = $s.Left; $t0 = $s.Top
  try { $s.DragMove() } catch {}
  if ([Math]::Abs($s.Left - $l0) -ge 1 -or [Math]::Abs($s.Top - $t0) -ge 1) {
    if ($script:mini) { $script:mx = $s.Left; $script:my = $s.Top } else { $script:hasPos = $true; $script:nx = $s.Left; $script:ny = $s.Top }
    Save-State
  } })
$w.FindName('mMini').Add_Click({ Toggle-Mini })
$w.FindName('mTop').Add_Click({ $script:miniTop = [bool]$w.FindName('mTop').IsChecked; if ($script:mini) { $w.Topmost = $script:miniTop }; Save-State })
if ($v.kind -ne 'list') { $w.FindName('mMini').Visibility = 'Collapsed'; $w.FindName('mTop').Visibility = 'Collapsed' }
$w.FindName('x').Add_Click({ $w.Close() })
$w.FindName('close').Add_Click({ $w.Close() })
$w.FindName('mClose').Add_Click({ $w.Close() })
$w.FindName('mCenter').Add_Click({ if ($script:mini) { Exit-Mini }; Center-Window; Keep-Inside; $script:hasPos = $false; $script:nx = $null; Save-State })
$w.FindName('mSize').Add_Click({ if ($w.FindName('sv')) { if ($script:mini) { Exit-Mini }; Reset-Size; Keep-Inside } })
$openBtn = $w.FindName('open')
if ($openBtn) { $openBtn.Add_Click({ Start-Process $v.appUrl; $w.Close() }) }
$w.Add_SizeChanged({ if ($script:placed -and -not $script:mini) { Keep-Inside } })

$w.Add_Loaded({
  # 一覧部分だけスクロールにして、ウィンドウは画面の高さに収める
  if ($w.FindName('sv')) { Apply-Size }
  Center-Window
  # タスクスケジューラ(wscript の非表示起動)経由だと、起動時の「隠す」指定が最初の表示に引き継がれて
  # ウィンドウが見えないことがある。見えていなければ明示的に表示する
  $h = (New-Object Windows.Interop.WindowInteropHelper($w)).Handle
  $showCmd = if ($script:quiet) { 4 } else { 5 }   # 4=SW_SHOWNOACTIVATE(撮影時はフォーカスを取らない)
  if (-not [SomedayNotify.Win]::IsWindowVisible($h)) { [Console]::Error.WriteLine('[show] window was hidden at load; ShowWindow'); [SomedayNotify.Win]::ShowWindow($h, $showCmd) | Out-Null }
  if (-not $script:quiet) { [SomedayNotify.Win]::SetForegroundWindow($h) | Out-Null; $w.Activate() | Out-Null }
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
  $script:t.Add_Tick({ $script:t.Stop(); if (-not $script:mini) { $w.Topmost = $false } })
  $script:t.Start()

  # ---- 確認用の自動操作(マウス・キーボードは使わない) ----
  $script:auto = [System.Collections.Queue]::new()
  if ($AutoExpand) { $script:auto.Enqueue({ Toggle-Expand }) }
  if ($AutoMini) { $script:auto.Enqueue({ Toggle-Mini }) }
  if ($AutoAdd) {
    $script:auto.Enqueue({ Open-AddForm })
    foreach ($a in ($AutoAdd -split ';')) {
      $f = $a -split '\|'
      $script:auto.Enqueue([scriptblock]::Create("`$w.FindName('inp').Text = '$($f[0] -replace "'", "''")'; Select-Chip $([int]$f[1]); Select-Label $([int]$f[2]); Do-Add"))
    }
  }
  if ($AutoEdit) {
    foreach ($a in ($AutoEdit -split ';')) {
      $f = $a -split '\|'
      $script:auto.Enqueue([scriptblock]::Create("`$r = `$script:rows[$([int]$f[0])]; Open-Edit `$r.id; `$ff = `$script:ef; `$ff.FindName('etitle').Text = '$($f[1] -replace "'", "''")'; `$ff.FindName('edue').Text = '$($f[2])'; Select-ELabel $([int]$f[3]); `$ff.FindName('enote').Text = '$($f[4] -replace "'", "''")'"))
      if ($f.Count -ge 6 -and $f[5] -eq 'save') { $script:auto.Enqueue({ Do-Edit }) }
    }
  }
  if ($AutoDelete) { foreach ($a in ($AutoDelete -split ',')) { $script:auto.Enqueue([scriptblock]::Create("Delete-Row `$script:rows[$([int]$a)].id")) } }
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
