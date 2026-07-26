import { useState } from 'react'
import { gql, invokeActionFlow, ACCOUNT_ADMIN_FLOW_ID } from '@/lib/graphql'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, UserRound, Phone, KeyRound, Send } from 'lucide-react'

/**
 * 账号设置（客户端/服务端共用）：
 * - 昵称：随时可改，未设置时各处展示用户名
 * - 绑定手机号：短信验证码验证后绑定，是修改密码的前置条件
 * - 修改密码：需先绑定手机号，通过短信验证码校验后重置
 */
export default function AccountSettings() {
  const { auth, refreshAccount } = useAuth()
  const account = auth!.account

  /* ---------- 昵称 ---------- */
  const [nickname, setNickname] = useState(account.nickname ?? '')
  const [savingNick, setSavingNick] = useState(false)

  const saveNickname = async () => {
    const v = nickname.trim()
    if (!v) {
      toast.error('昵称不能为空')
      return
    }
    if (v.length > 20) {
      toast.error('昵称最长 20 个字符')
      return
    }
    setSavingNick(true)
    try {
      await invokeActionFlow(ACCOUNT_ADMIN_FLOW_ID, { op: 'set_my_nickname', 昵称: v, accountId: 0 })
      await refreshAccount()
      toast.success('昵称已更新')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingNick(false)
    }
  }

  /* ---------- 绑定手机号 ---------- */
  const [phone, setPhone] = useState('')
  const [bindCode, setBindCode] = useState('')
  const [bindSending, setBindSending] = useState(false)
  const [binding, setBinding] = useState(false)

  const sendBindCode = async () => {
    if (!/^1\d{10}$/.test(phone.trim())) {
      toast.error('请输入正确的 11 位手机号')
      return
    }
    setBindSending(true)
    try {
      await gql(
        `mutation($p: String!) { sendVerificationCodeToPhone(telephone: $p, verificationEnumType: BIND) }`,
        { p: phone.trim() },
      )
      toast.success('验证码已发送，请查收短信')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败，请稍后重试')
    } finally {
      setBindSending(false)
    }
  }

  const bindPhone = async () => {
    if (!bindCode.trim()) {
      toast.error('请输入短信验证码')
      return
    }
    setBinding(true)
    try {
      await gql(
        `mutation($p: String!, $c: String!) { bindPhoneNumberByVerificationCode(telephone: $p, verificationCode: $c) }`,
        { p: phone.trim(), c: bindCode.trim() },
      )
      await refreshAccount()
      setBindCode('')
      toast.success('手机号绑定成功，现在可以修改密码了')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '绑定失败，请检查验证码')
    } finally {
      setBinding(false)
    }
  }

  /* ---------- 修改密码 ---------- */
  const boundPhone = account.fz_phone_number?.trim() || ''
  const [newPassword, setNewPassword] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetting, setResetting] = useState(false)

  const sendResetCode = async () => {
    setResetSending(true)
    try {
      await gql(
        `mutation($p: String!) { sendVerificationCodeToPhone(telephone: $p, verificationEnumType: RESET_PASSWORD) }`,
        { p: boundPhone },
      )
      toast.success('验证码已发送到绑定手机号')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败，请稍后重试')
    } finally {
      setResetSending(false)
    }
  }

  const resetPassword = async () => {
    if (newPassword.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (!resetCode.trim()) {
      toast.error('请输入短信验证码')
      return
    }
    setResetting(true)
    try {
      await gql(
        `mutation($p: String!, $c: String!, $np: String!) {
          resetPasswordWithPhone(telephone: $p, verificationCode: $c, password: $np) { account { id } }
        }`,
        { p: boundPhone, c: resetCode.trim(), np: newPassword },
      )
      setNewPassword('')
      setResetCode('')
      toast.success('密码修改成功，下次登录请使用新密码')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '修改失败，请检查验证码')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">账号设置</h1>

      {/* 昵称 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4" /> 昵称
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-400">
            昵称会展示在页面顶部、项目分配等位置；未设置时展示登录账号（当前账号：{account.username}）
          </p>
          <div className="flex gap-2">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="设置你的昵称（最长 20 字）"
              maxLength={20}
            />
            <Button className="shrink-0 bg-slate-900 hover:bg-slate-800" disabled={savingNick} onClick={saveNickname}>
              {savingNick && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} 保存
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 绑定手机号 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" /> 绑定手机号
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {boundPhone ? (
            <p className="rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">
              已绑定手机号：{boundPhone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')}
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-400">修改密码前必须先绑定手机号，验证码通过短信发送</p>
              <div className="flex gap-2">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="输入 11 位手机号"
                  maxLength={11}
                  inputMode="numeric"
                />
                <Button variant="outline" className="shrink-0" disabled={bindSending} onClick={sendBindCode}>
                  {bindSending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                  发送验证码
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={bindCode}
                  onChange={(e) => setBindCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="输入短信验证码"
                  maxLength={6}
                  inputMode="numeric"
                />
                <Button className="shrink-0 bg-slate-900 hover:bg-slate-800" disabled={binding} onClick={bindPhone}>
                  {binding && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} 绑定
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 修改密码 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> 修改密码
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!boundPhone ? (
            <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              请先在上方绑定手机号，绑定后才能修改密码
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>新密码</Label>
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位，建议包含大小写字母、数字和符号"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="短信验证码"
                  maxLength={6}
                  inputMode="numeric"
                />
                <Button variant="outline" className="shrink-0" disabled={resetSending} onClick={sendResetCode}>
                  {resetSending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                  发送验证码
                </Button>
              </div>
              <Button className="bg-slate-900 hover:bg-slate-800" disabled={resetting || !newPassword} onClick={resetPassword}>
                {resetting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} 确认修改密码
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
