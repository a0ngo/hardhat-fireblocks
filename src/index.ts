import { extendConfig, extendEnvironment } from "hardhat/config";
import { BackwardsCompatibilityProviderAdapter } from "hardhat/internal/core/providers/backwards-compatibility";
import {
  AutomaticGasPriceProvider,
  AutomaticGasProvider,
} from "hardhat/internal/core/providers/gas-providers";
import { HttpProvider } from "hardhat/internal/core/providers/http";
import {
  EIP1193Provider,
  HardhatConfig,
  HardhatUserConfig,
  HttpNetworkUserConfig,
} from "hardhat/types";
import { Dispatcher, ProxyAgent, setGlobalDispatcher } from "undici";

import { version as SDK_VERSION } from "../package.json";

import { FireblocksSigner } from "./provider";
import "./type-extensions";

extendConfig(
  (config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
    const userNetworks = userConfig.networks;
    if (userNetworks === undefined) {
      return;
    }
    for (const networkName in userNetworks) {
      const network = userNetworks[networkName]! as HttpNetworkUserConfig;
      if (network.fireblocks) {
        if (
          networkName === "hardhat" ||
          (network.url || "").includes("localhost") ||
          (network.url || "").includes("127.0.0.1")
        ) {
          throw new Error("Fireblocks is only supported for public networks.");
        }
        (config.networks[networkName] as HttpNetworkUserConfig).fireblocks = {
          note: "Created by Fireblocks Hardhat Plugin",
          logTransactionStatusChanges: true,
          ...network.fireblocks,
          rpcUrl: network.url,
          userAgent: `hardhat-fireblocks/${SDK_VERSION}`,
        };
      }
    }
  }
);

extendEnvironment((hre) => {
  if ((hre.network.config as HttpNetworkUserConfig).fireblocks) {
    const httpNetConfig = hre.network.config as HttpNetworkUserConfig;
    const fireblocksW3PConfig = (hre.network.config as HttpNetworkUserConfig)
      .fireblocks!;
    let dispatcher: Dispatcher | undefined = undefined;
    if (fireblocksW3PConfig.proxyPath) {
      dispatcher = new ProxyAgent({
        uri: fireblocksW3PConfig.proxyPath!,
        connect: { timeout: 60000 },
      });
      setGlobalDispatcher(dispatcher);
    }
    const eip1193Provider = new HttpProvider(
      httpNetConfig.url!,
      hre.network.name,
      httpNetConfig.httpHeaders,
      httpNetConfig.timeout,
      dispatcher
    );
    let wrappedProvider: EIP1193Provider;
    wrappedProvider = new FireblocksSigner(
      eip1193Provider,
      fireblocksW3PConfig
    );
    wrappedProvider = new AutomaticGasProvider(
      wrappedProvider,
      hre.network.config.gasMultiplier
    );
    wrappedProvider = new AutomaticGasPriceProvider(wrappedProvider);
    hre.network.provider = new BackwardsCompatibilityProviderAdapter(
      wrappedProvider
    );
  }
});
