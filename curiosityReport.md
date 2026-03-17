# How Prometheus Works To Collect Metrics for Grafana Curiosity Report

## Introduction

As we were working on the deliverables for metrics collection in Grafana, it was mentioned a couple of times that we were also using a tool called `Prometheus` to help collect some of those metrics. While Grafana mainly allows us to craft visualizations for our metrics, I was curious how `Prometheus` actually works in depth to collect the metrics needed to create those visualizations. In this report, I will talk about how `Prometheus` really works in depth, why it is important, an example of using `Prometheus` separately from Grafana, and more. 

## Prometheus Overview

While Prometheus and Grafana are used heavily together, they are both separate open source tools used together. Prometheus, which was originally developed at SoundCloud, is a tool that helps developers monitor their system and create alerts based on things that happen in their system. Prometheus stores data collected with a timestamp and labels on its own servers/databases, and has become a great tool for developers to use. In order to collect these metrics, they consistently scrape data from your application so that the metrics collected are up to date and readily available.

Main Features of Prometheus:

- 
