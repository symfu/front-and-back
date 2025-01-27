import axios from "axios"
import moment from "moment"

import React from "react"
import { Icon, message } from "antd"

import Tab from "containers/Tab"
import AccountContext from "context/account-context"
import ChatContext from "context/chat-context"

import socketManager from "socket/socket"
import storageManager from "utils/storage"
import urls from "config/urls"
// import { setPageTitle, getPageTitle } from "utils/pageTitle"

require("moment/locale/zh-cn") //moment.js bug, has to manually include

const DEFAULT_TAB = "chat"

const DEFAULT_REAL_ROOM = {
  name: "大厅",
  id: "5",
  about: "this is lobby"
}

class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      account: null,
      // A few steps before mounting the app
      // 1. Check local/chrome storage to see if there's account data
      // , if so, mount the app.
      // 2. If no account in storage, check if there's credential data
      // in storage, if so, mount the app and auto login
      // 3. If neither account nor credential data is in storage,
      // mount the app and auto register

      // TODO: remove 1 and 2?

      // In short, do not mount until done loading account/credential
      // from storage

      // above comment needs update
      loadingAccountFromStorage: true,
      waitingForConfigFromParent: true,
      // Only if there is no account data in storage on page load
      // autoLogin only once per page load
      autoLogin: false,
      mode: null,
      room: null,
      realRoom: DEFAULT_REAL_ROOM
    }
    const locale = window.navigator.userLanguage || window.navigator.language
    if (locale.indexOf("zh") > -1) {
      moment.locale("zh-cn")
    }
    // window.spDebug(locale)
    message.config({
      top: 80,
      duration: 2,
      maxCount: 3
    })
  }

  componentDidMount() {
    // TODO: this componentDidMount is registering a
    // couple different things, maybe move them to dedicated module

    // General settings for ajax calls
    axios.interceptors.response.use(
      response => {
        // Do something with response data
        return response
      },
      error => {
        let errorMessage = "出错了"
        // set account to null when we receive 401
        if (error.response && error.response.status === 401) {
          this.setAccount(null)
          errorMessage = "请重新登录"
        }
        if (
          error.response &&
          error.response.data &&
          error.response.data.error
        ) {
          errorMessage = error.response.data.error
        }
        if (error.response && error.response.status === 403) {
          errorMessage = "禁止通行"
        }
        if (error.response && error.response.status === 409) {
          errorMessage = "权限不足"
        }
        if (error.response && error.response.status === 413) {
          errorMessage = "文件太大"
        }
        if (error.response && error.response.status === 429) {
          errorMessage = "操作频繁，请稍后再试"
        }
        if (error.response && error.response.status === 402) {
          errorMessage = "积分不足"
        }

        message.error(errorMessage)
        console.error(error)
        return Promise.reject(error)
      }
    )
    // storageManager.get("mode", mode => {
    //   if (mode) {
    //     this.setState({ mode: mode })
    //   }
    // })

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: "getConfig" }, "*")
      storageManager.pushToParentWindow()
    } else {
      window.spConfig = {}
      this.setState({ waitingForConfigFromParent: false })
      console.error("no parent window!")
    }

    storageManager.get("realRoom", realRoom => {
      if (realRoom) {
        this.setState({ realRoom: realRoom })
      }
    })

    // console.log("get account from storage, register account change listener")
    storageManager.get("account", account => {
      if (account) {
        window.spDebug("found account in storage")
        // window.spDebug(account)
        this.setState({ account: account })
      } else {
        this.setState({ autoLogin: true })
        window.spDebug("no account found in storage")
      }
      this.setState({ loadingAccountFromStorage: false })
    })
    storageManager.addEventListener("account", account => {
      this.setState({ account: account })
    })
    socketManager.addHandler("login", "popup", () => {
      message.success("连接成功！", 2)
    })
    socketManager.addHandler("disconnect", "popup", () => {
      message.warn("连接已断开", 2)
    })
    socketManager.addHandler("alert", "popup", data => {
      if (data.errorCode === 401) {
        message.error("请重新登录", 2)
      } else if (data.errorCode === 402) {
        message.error("积分不足", 2)
      } else if (data.errorCode === 403) {
        message.error("禁止通行", 2)
      } else if (data.errorCode === 404) {
        message.error("找不到", 2)
      } else if (data.errorCode === 409) {
        message.error("权限不足", 2)
      } else if (data.errorCode === 426) {
        message.error("请升级该扩展", 2)
      } else if (data.errorCode === 429) {
        message.error("请慢一点", 2)
      } else {
        message.error("未知错误: " + data.errorCode, 3)
      }
    })

    window.addEventListener(
      "message",
      e => {
        if (e && e.data && e.data.type === "config") {
          const spConfig = e.data.data
          window.spConfig = spConfig
          urls.dbAPI = spConfig.apiUrl || urls.dbAPI
          urls.socketAPI = spConfig.socketUrl || urls.socketAPI
          this.setState({ waitingForConfigFromParent: false })
        }
      },
      false
    )
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    // Need to differentiate login/logout with profile info update
    // maybe shouldn't have grouped them in one object?
    const login = !prevState.account && this.state.account
    const logout = prevState.account && !this.state.account
    if (login) {
      window.spDebug("logged in")
      axios.defaults.headers.common["token"] = this.state.account.token
    }
    if (logout) {
      window.spDebug("logged out")
      axios.defaults.headers.common["token"] = null
      // clear storage
      storageManager.set("unread", false)
      storageManager.set("inbox", null)
      storageManager.set("inbox-offset", 0)
      // TODO:  change tab?
    }
  }

  setAccount = account => {
    // window.spDebug("set account")
    storageManager.set("account", account)
  }

  stopAutoLogin = () => {
    this.setState({ autoLogin: false })
  }

  render() {
    if (
      this.state.loadingAccountFromStorage ||
      this.state.waitingForConfigFromParent
    ) {
      return (
        <center>
          <Icon style={{ marginTop: "50%" }} type="loading" />
        </center>
      )
    }
    let tab = DEFAULT_TAB
    if (!this.state.account) {
      tab = "account"
    }
    return (
      <AccountContext.Provider
        value={{
          account: this.state.account,
          setAccount: this.setAccount,
          autoLogin: this.state.autoLogin,
          stopAutoLogin: this.stopAutoLogin
        }}
      >
        <ChatContext.Provider
          value={{
            mode: this.state.mode,
            setMode: mode => {
              // console.log("setting mode")
              this.setState({ mode: mode })
            },
            room: this.state.room,
            setRoom: room => {
              // console.log("setting room")
              this.setState({ room: room })
            },
            realRoom: this.state.realRoom,
            setRealRoom: realRoom => {
              this.setState({ realRoom: realRoom })
            }
          }}
        >
          <Tab tab={tab} />
        </ChatContext.Provider>
      </AccountContext.Provider>
    )
  }
}

export default App
